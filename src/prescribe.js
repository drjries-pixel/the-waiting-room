/**
 * Turns a medication library entry into the sentence a clinician would actually
 * say when starting someone on it.
 *
 * Composed purely from fields that exist in medications.json — nothing here is
 * invented. In particular there is no dose and no frequency: the library
 * deliberately carries none (see its _meta.rules), so any "take one a day"
 * would be fabricated. Real prescribers spend their words on what the drug does
 * and when it will help, which is also the part worth teaching.
 */
export function composePrescription(med, patientFirstName) {
  const opener = patientFirstName
    ? `${patientFirstName}, I'd like to start you on ${med.generic}`
    : `I'd like to start you on ${med.generic}`;
  const brand = med.brand && !med.brand.startsWith('(') ? ` — you might see it called ${med.brand}` : '';

  return [
    `${opener}${brand}.`,
    med.how_it_works,
    med.good_to_know,
    "I'll go through exactly how to take it before you leave, and we'll see how you're getting on when you come back.",
  ].join(' ');
}
