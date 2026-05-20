// Confirm challenge_3.* data is populated.
import { q, close } from '../../lib/db.mjs';

try {
  const counts = await q(`SELECT
    (SELECT count(*)::int FROM challenge_3.students) AS students,
    (SELECT count(*)::int FROM challenge_3.subjects) AS subjects,
    (SELECT count(*)::int FROM challenge_3.grade_history) AS grade_history,
    (SELECT count(*)::int FROM challenge_3.iep_notes) AS iep_notes,
    (SELECT count(*)::int FROM challenge_3.students WHERE has_complexity) AS complex_students`);
  console.log('counts:', counts.rows[0]);

  const byGrade = await q(`SELECT current_grade,
    count(*)::int AS students,
    count(*) FILTER (WHERE has_complexity)::int AS with_complexity
    FROM challenge_3.students GROUP BY current_grade
    ORDER BY CASE WHEN current_grade='K' THEN 0 ELSE current_grade::int END`);
  console.log('by grade:');
  byGrade.rows.forEach(r => console.log('  ' + String(r.current_grade).padEnd(3) + ' ' +
    String(r.students).padStart(4) + ' students, ' + String(r.with_complexity).padStart(3) + ' with complexity'));

  const struggling = await q(`SELECT s.current_grade,
    count(DISTINCT s.id)::int AS struggling_students
    FROM challenge_3.students s
    WHERE EXISTS (SELECT 1 FROM challenge_3.grade_history gh
      WHERE gh.student_id = s.id AND gh.struggling = true)
    GROUP BY s.current_grade
    ORDER BY CASE WHEN s.current_grade='K' THEN 0 ELSE s.current_grade::int END`);
  console.log('struggling students by grade:');
  struggling.rows.forEach(r => console.log('  ' + String(r.current_grade).padEnd(3) + ' ' + r.struggling_students));
} finally {
  await close();
}
