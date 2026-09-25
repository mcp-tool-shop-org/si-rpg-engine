// Subject text for a belief. No file access: the product harness imports this.

/**
 * @param {{ body?: string, zone?: string } | string} subject
 */
export function subjectKind(subject) {
  if (typeof subject === 'string') {
    return null;
  }
  if (typeof subject.body === 'string' && subject.zone === undefined) {
    return 'body';
  }
  if (typeof subject.zone === 'string' && subject.body === undefined) {
    return 'zone';
  }
  return null;
}

/**
 * @param {{ body?: string, zone?: string } | string} subject
 */
export function subjectText(subject) {
  if (typeof subject === 'string') {
    return subject;
  }
  if (typeof subject.body === 'string') {
    return 'body:' + subject.body;
  }
  if (typeof subject.zone === 'string') {
    return 'zone:' + subject.zone;
  }
  return '';
}
