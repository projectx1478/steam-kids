// lessons/*.json を fetch で読み込む。
export async function loadLesson(lessonId) {
  const res = await fetch(`./lessons/${lessonId}.json`);
  if (!res.ok) throw new Error(`lesson fetch failed: ${res.status}`);
  return res.json();
}
