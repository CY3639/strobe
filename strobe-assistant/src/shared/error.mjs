/*
 * An error that retrying cannot fix (wrong file type, too large).
 * The classifier records these instead of sending them back to SQS.
 */
export class PermanentError extends Error {
    constructor(message) {
        super(message);
        this.name = "PermanentError";
    }
}