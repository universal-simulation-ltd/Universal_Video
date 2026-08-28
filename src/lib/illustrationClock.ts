/**
 * The maths behind the landing illustration's single clock.
 *
 * ⚠️ **This file is now a re-export, and deliberately so.** Both the loop and
 * this maths live in `@unisim/sdk` as of 0.118.0 — the loop was inline in five
 * app repos, and this was the pure half split out because it is the part with
 * an honest unit test.
 *
 * The test is why the file survives the lift. The SDK has no test runner, so
 * moving the maths there and deleting `illustrationClock.test.ts` would have
 * traded one implementation for zero tests. Re-exporting keeps that test
 * running against the real implementation instead of a stale copy of it.
 *
 * ⚠️ The header this replaces said "this is the third" and told you a *fourth*
 * copy should go to the SDK. There were five, and it was wrong before anyone
 * read it — the same failure as the icon generator's header. A comment
 * asserting how many copies exist goes stale exactly as fast as the code does.
 */
export { smoothstep, unSmoothstep } from '@unisim/sdk'
