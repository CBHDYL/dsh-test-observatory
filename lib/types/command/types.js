/**
 * Configuration types of the `/test` command.
 * @module @cbhdyl/dsh-test-observatory/command/types
 */
/**
 * Every structured result format this package can read. The runtime list is the
 * single source of truth: the accepted values and the message that lists them
 * are both derived from it, so adding a format cannot leave the two disagreeing.
 */
export const STRUCTURED_RESULT_FORMATS = ['junit', 'vitest', 'jest', 'playwright', 'pytest', 'api', 'performance', 'sarif'];
