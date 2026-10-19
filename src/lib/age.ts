// Age in whole years on a given day, from a "YYYY-MM-DD" birthdate.
export function ageOn(birthdate: string, today = new Date()) {
  const b = new Date(birthdate);
  let a = today.getFullYear() - b.getFullYear();
  if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) a--;
  return a;
}
