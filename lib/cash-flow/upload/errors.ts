/** What a reader of this module throws when a workbook does not say what it should. The message
 *  is the user's, in Spanish, and names what was expected. */
export class CashFlowParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashFlowParseError";
  }
}
