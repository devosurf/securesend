import { beforeEach } from "vitest";
import { forgetEveryone } from "./src/limits/gates";

/*
 * Every test starts on an instance nobody has called yet.
 *
 * The rate limiters are in memory in this process, so they are shared mutable state
 * between test files in exactly the way the daily counters are, and a suite that made
 * a few hundred secrets would otherwise start tripping its own create limit halfway
 * through for reasons no test asked about.
 *
 * A test that wants to trip a limit does so inside one `it`, which this leaves alone.
 */
beforeEach(forgetEveryone);
