/** Everything used to live here separately from kit.ts (Buff/Gear/Action vs. State/Slot/
 *  evaluate()); the new engine merged them into one file. Kept as a re-export so anything still
 *  importing from "./state.js" doesn't need its own path fix. */
export * from "./kit.js";
