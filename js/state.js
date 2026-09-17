export const S = {
  lesson: null,
  stepIndex: 0,
  learnerId: crypto.randomUUID(),
  furigana: false,
};

export function initState(lesson) {
  S.lesson = lesson;
  S.stepIndex = 0;
}

export function currentStep() {
  return S.lesson.steps[S.stepIndex];
}
