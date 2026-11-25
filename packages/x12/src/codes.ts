/**
 * Standard X12 acknowledgment code lists (version 004010).
 * These are the codes a trading partner sees in TA1 / 997 responses.
 */

/** TA1 I18 – Interchange Note Code. */
export const TA1_NOTE_CODES: Record<string, string> = {
  '000': 'No error',
  '001': 'The Interchange Control Number in the Header and Trailer Do Not Match',
  '002': 'This Standard as Noted in the Control Standards Identifier is Not Supported',
  '003': 'This Version of the Controls is Not Supported',
  '004': 'The Segment Terminator is Invalid',
  '005': 'Invalid Interchange ID Qualifier for Sender',
  '006': 'Invalid Interchange Sender ID',
  '007': 'Invalid Interchange ID Qualifier for Receiver',
  '008': 'Invalid Interchange Receiver ID',
  '009': 'Unknown Interchange Receiver ID',
  '010': 'Invalid Authorization Information Qualifier Value',
  '012': 'Invalid Security Information Qualifier Value',
  '014': 'Invalid Interchange Date Value',
  '015': 'Invalid Interchange Time Value',
  '016': 'Invalid Interchange Standards Identifier Value',
  '017': 'Invalid Interchange Version ID Value',
  '018': 'Invalid Interchange Control Number Value',
  '019': 'Invalid Acknowledgment Requested Value',
  '020': 'Invalid Test Indicator Value',
  '021': 'Invalid Number of Included Groups Value',
  '022': 'Invalid Control Structure',
  '023': 'Improper (Premature) End-of-File (Transmission)',
  '024': 'Invalid Interchange Content (e.g., Invalid GS Segment)',
  '025': 'Duplicate Interchange Control Number',
  '026': 'Invalid Data Element Separator',
  '027': 'Invalid Component Element Separator',
};

/** TA1 I17 – Interchange Acknowledgment Code. */
export const TA1_ACK_CODES: Record<string, string> = {
  A: 'The Transmitted Interchange Control Structure Header and Trailer Have Been Received and Have No Errors',
  E: 'Accepted with Errors',
  R: 'Rejected because of Errors',
};

/** AK9 716 – Functional Group Syntax Error Code. */
export const AK9_ERROR_CODES: Record<string, string> = {
  '1': 'Functional Group Not Supported',
  '2': 'Functional Group Version Not Supported',
  '3': 'Functional Group Trailer Missing',
  '4': 'Group Control Number in the Functional Group Header and Trailer Do Not Agree',
  '5': 'Number of Included Transaction Sets Does Not Match Actual Count',
  '6': 'Group Control Number Violates Syntax',
};

/** AK9 715 / AK5 717 – acknowledgment codes. */
export const ACK_STATUS_CODES: Record<string, string> = {
  A: 'Accepted',
  E: 'Accepted, But Errors Were Noted',
  P: 'Partially Accepted, At Least One Transaction Set Was Rejected',
  R: 'Rejected',
};

/** AK5 718 – Transaction Set Syntax Error Code. */
export const AK5_ERROR_CODES: Record<string, string> = {
  '1': 'Transaction Set Not Supported',
  '2': 'Transaction Set Trailer Missing',
  '3': 'Transaction Set Control Number in Header and Trailer Do Not Match',
  '4': 'Number of Included Segments Does Not Match Actual Count',
  '5': 'One or More Segments in Error',
  '6': 'Missing or Invalid Transaction Set Identifier',
  '7': 'Missing or Invalid Transaction Set Control Number',
  '23': 'Transaction Set Control Number Not Unique within the Functional Group',
};

/** AK3 720 – Segment Syntax Error Code. */
export const AK3_ERROR_CODES: Record<string, string> = {
  '1': 'Unrecognized segment ID',
  '2': 'Unexpected segment',
  '3': 'Mandatory segment missing',
  '4': 'Loop Occurs Over Maximum Times',
  '5': 'Segment Exceeds Maximum Use',
  '6': 'Segment Not in Defined Transaction Set',
  '7': 'Segment Not in Proper Sequence',
  '8': 'Segment Has Data Element Errors',
};

/** AK4 723 – Data Element Syntax Error Code. */
export const AK4_ERROR_CODES: Record<string, string> = {
  '1': 'Mandatory data element missing',
  '2': 'Conditional required data element missing',
  '3': 'Too many data elements',
  '4': 'Data element too short',
  '5': 'Data element too long',
  '6': 'Invalid character in data element',
  '7': 'Invalid code value',
  '8': 'Invalid Date',
  '9': 'Invalid Time',
  '10': 'Exclusion Condition Violated',
};

export function describeAckCode(source: string, code: string | undefined | null): string | undefined {
  if (!code) return undefined;
  switch (source) {
    case 'TA1':
      return TA1_NOTE_CODES[code];
    case 'AK9':
      return AK9_ERROR_CODES[code];
    case 'AK5':
      return AK5_ERROR_CODES[code];
    case 'AK3':
      return AK3_ERROR_CODES[code];
    case 'AK4':
      return AK4_ERROR_CODES[code];
    default:
      return undefined;
  }
}
