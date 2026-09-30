//! Coarse section timers, compiled in only with `--features prof`.
use std::cell::RefCell;
use std::time::Instant;

thread_local! {
    pub static T: RefCell<Vec<(&'static str, f64, u64)>> = RefCell::new(vec![]);
}

pub struct Span(&'static str, Instant);
impl Drop for Span {
    fn drop(&mut self) {
        let dt = self.1.elapsed().as_secs_f64();
        T.with(|t| {
            let mut t = t.borrow_mut();
            match t.iter_mut().find(|x| x.0 == self.0) {
                Some(x) => {
                    x.1 += dt;
                    x.2 += 1;
                }
                None => t.push((self.0, dt, 1)),
            }
        });
    }
}
pub fn span(name: &'static str) -> Span {
    Span(name, Instant::now())
}
pub fn report(runs: usize) {
    T.with(|t| {
        for (name, s, n) in t.borrow().iter() {
            println!("{:>14}: {:8.4} ms/run  {:8.1} calls/run", name, s * 1000.0 / runs as f64, *n as f64 / runs as f64);
        }
    });
}
