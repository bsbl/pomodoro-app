// Pomodoro state machine.
// States: Idle -> Running -> (Paused <-> Running) -> Alerting -> Break -> Idle
//
// The JS version used an EventEmitter (emits 'update'/'alert'/'break-start'/
// 'break-end') plus setInterval (1s tick) and setTimeout (30s one-shots for
// the alert auto-break and the post-stop auto-break). Rust/Tauri has no
// single-threaded event loop to lean on, so:
//   - every mutating method here returns the ordered list of Event values
//     the caller (commands.rs) must emit to the frontend/tray, mirroring
//     the JS emit() calls exactly.
//   - the two 30s one-shot timeouts are represented as generation tokens
//     (alert_token / post_stop_token): a background task sleeps 30s then
//     only acts if its captured token still matches current state, which
//     mirrors clearTimeout() semantics without needing cancellable handles.

use serde::Serialize;

pub const ALERT_TIMEOUT_SECONDS: u64 = 30;
pub const POST_STOP_TIMEOUT_SECONDS: u64 = 30;
const SNOOZE_SECONDS: i64 = 60;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum State {
    Idle,
    Running,
    Paused,
    Alerting,
    Break,
}

impl State {
    pub fn as_str(&self) -> &'static str {
        match self {
            State::Idle => "idle",
            State::Running => "running",
            State::Paused => "paused",
            State::Alerting => "alerting",
            State::Break => "break",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BreakType {
    Short,
    Long,
}

impl BreakType {
    pub fn as_str(&self) -> &'static str {
        match self {
            BreakType::Short => "short",
            BreakType::Long => "long",
        }
    }
}

#[derive(Serialize, Clone)]
pub struct Snapshot {
    pub state: &'static str,
    #[serde(rename = "taskLabel")]
    pub task_label: Option<String>,
    pub remaining: i64,
    #[serde(rename = "breakType")]
    pub break_type: Option<&'static str>,
    #[serde(rename = "completedSessions")]
    pub completed_sessions: u32,
}

#[derive(Serialize, Clone, Copy)]
pub struct Settings {
    #[serde(rename = "workSeconds")]
    pub work_seconds: i64,
    #[serde(rename = "shortBreakSeconds")]
    pub short_break_seconds: i64,
    #[serde(rename = "longBreakSeconds")]
    pub long_break_seconds: i64,
    #[serde(rename = "sessionsBeforeLongBreak")]
    pub sessions_before_long_break: u32,
}

/// Frontend/tray event to emit, in the same spirit as timer.js's
/// `this.emit(...)` calls. Order in the returned Vec matters (Update always
/// comes first, matching JS's _emitUpdate()-then-emit(...) pattern).
#[derive(PartialEq, Eq, Debug, Clone, Copy)]
pub enum Event {
    Update,
    Alert,
    BreakStart,
    BreakEnd,
}

pub struct Timer {
    pub state: State,
    pub task_label: Option<String>,
    pub remaining: i64,
    pub break_type: Option<BreakType>,
    pub completed_sessions: u32,

    pub work_seconds: i64,
    pub short_break_seconds: i64,
    pub long_break_seconds: i64,
    pub sessions_before_long_break: u32,

    // Generation tokens guarding the one-shot alert/post-stop timeouts.
    // A background task scheduled with a given token only acts if the
    // field still holds that same Some(token) when it wakes up.
    pub alert_token: Option<u64>,
    pub post_stop_token: Option<u64>,
    next_token: u64,
}

impl Timer {
    pub fn new() -> Self {
        Timer {
            state: State::Idle,
            task_label: None,
            remaining: 0,
            break_type: None,
            completed_sessions: 0,
            work_seconds: 25 * 60,
            short_break_seconds: 5 * 60,
            long_break_seconds: 15 * 60,
            sessions_before_long_break: 4,
            alert_token: None,
            post_stop_token: None,
            next_token: 1,
        }
    }

    fn new_token(&mut self) -> u64 {
        let t = self.next_token;
        self.next_token += 1;
        t
    }

    pub fn configure(
        &mut self,
        work_seconds: Option<i64>,
        short_break_seconds: Option<i64>,
        long_break_seconds: Option<i64>,
        sessions_before_long_break: Option<u32>,
    ) {
        if let Some(v) = work_seconds {
            if v > 0 {
                self.work_seconds = v;
            }
        }
        if let Some(v) = short_break_seconds {
            if v > 0 {
                self.short_break_seconds = v;
            }
        }
        if let Some(v) = long_break_seconds {
            if v > 0 {
                self.long_break_seconds = v;
            }
        }
        if let Some(v) = sessions_before_long_break {
            if v > 0 {
                self.sessions_before_long_break = v;
            }
        }
    }

    pub fn get_settings(&self) -> Settings {
        Settings {
            work_seconds: self.work_seconds,
            short_break_seconds: self.short_break_seconds,
            long_break_seconds: self.long_break_seconds,
            sessions_before_long_break: self.sessions_before_long_break,
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            state: self.state.as_str(),
            task_label: self.task_label.clone(),
            remaining: self.remaining,
            break_type: self.break_type.map(|b| b.as_str()),
            completed_sessions: self.completed_sessions,
        }
    }

    pub fn start_task(&mut self, label: String) -> Vec<Event> {
        self.post_stop_token = None; // cancel any pending post-stop auto-break
        self.task_label = Some(label);
        self.state = State::Running;
        self.remaining = self.work_seconds;
        self.break_type = None;
        vec![Event::Update]
    }

    /// Always transitions to Idle and arms a fresh post-stop auto-break
    /// window. Returns the events to emit plus the token the caller must
    /// schedule a `POST_STOP_TIMEOUT_SECONDS` sleep for.
    pub fn stop_task(&mut self) -> (Vec<Event>, u64) {
        self.state = State::Idle;
        self.task_label = None;
        self.remaining = 0;
        self.break_type = None;
        let token = self.new_token();
        self.post_stop_token = Some(token);
        (vec![Event::Update], token)
    }

    pub fn reset_current(&mut self) -> Vec<Event> {
        if self.state != State::Running && self.state != State::Paused {
            return vec![];
        }
        self.remaining = self.work_seconds;
        self.state = State::Running;
        vec![Event::Update]
    }

    pub fn pause_current(&mut self) -> Vec<Event> {
        if self.state != State::Running {
            return vec![];
        }
        self.state = State::Paused;
        vec![Event::Update]
    }

    pub fn resume_current(&mut self) -> Vec<Event> {
        if self.state != State::Paused {
            return vec![];
        }
        self.state = State::Running;
        vec![Event::Update]
    }

    pub fn snooze(&mut self) -> Vec<Event> {
        if self.state != State::Alerting {
            return vec![];
        }
        self.alert_token = None; // cancel the pending auto-break
        self.state = State::Running;
        self.remaining = SNOOZE_SECONDS;
        vec![Event::Update]
    }

    pub fn stop_alert(&mut self) -> Vec<Event> {
        if self.state != State::Alerting {
            return vec![];
        }
        self.alert_token = None;
        self.start_break()
    }

    /// Only valid right after a manual Stop (state is Idle at that point).
    pub fn manual_break(&mut self) -> Vec<Event> {
        if self.state != State::Idle {
            return vec![];
        }
        self.post_stop_token = None;
        self.start_break()
    }

    pub fn dismiss_post_stop(&mut self) {
        self.post_stop_token = None;
    }

    fn start_break(&mut self) -> Vec<Event> {
        self.alert_token = None;
        // completed_sessions > 0 guards against a long break being wrongly
        // triggered by manual_break() on a very first Stop (0 % N == 0),
        // with no effect on the natural flow (completed_sessions is always
        // >= 1 there, since enter_alerting() increments it beforehand).
        let is_long_break =
            self.completed_sessions > 0 && self.completed_sessions % self.sessions_before_long_break == 0;
        self.break_type = Some(if is_long_break { BreakType::Long } else { BreakType::Short });
        self.remaining = if is_long_break { self.long_break_seconds } else { self.short_break_seconds };
        self.state = State::Break;
        vec![Event::Update, Event::BreakStart]
    }

    fn end_break(&mut self) -> Vec<Event> {
        self.state = State::Idle;
        self.break_type = None;
        self.task_label = None;
        self.remaining = 0;
        vec![Event::Update, Event::BreakEnd]
    }

    /// Advances the clock by one second. Called every second regardless of
    /// state; no-ops unless Running or Break. Returns the events to emit
    /// (if any) plus, when transitioning into Alerting, the new token the
    /// caller must schedule an `ALERT_TIMEOUT_SECONDS` sleep for.
    pub fn tick(&mut self) -> Option<(Vec<Event>, Option<u64>)> {
        if self.state != State::Running && self.state != State::Break {
            return None;
        }
        if self.remaining > 0 {
            self.remaining -= 1;
            return Some((vec![Event::Update], None));
        }
        match self.state {
            State::Running => {
                self.state = State::Alerting;
                self.completed_sessions += 1;
                let token = self.new_token();
                self.alert_token = Some(token);
                Some((vec![Event::Update, Event::Alert], Some(token)))
            }
            State::Break => Some((self.end_break(), None)),
            _ => None,
        }
    }
}
