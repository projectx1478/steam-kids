// P0ハードコード。P1で lessons/cmd-01-susumu.json へ同一形状のまま移す。
export const LESSON_CMD_01 = {
  lessonId: 'cmd-01-susumu',
  unitId: 'commands',
  title: 'すすむ',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'ゴールまで すすもう' },
    {
      stepId: 's2',
      kind: 'predict',
      text: 'どのマスに つく？',
      commands: ['up', 'up', 'right'],
      optionCells: [
        { id: 'A', x: 1, y: 2 },
        { id: 'B', x: 1, y: 1 },
        { id: 'C', x: 2, y: 1 },
      ],
      options: ['A', 'B', 'C'],
      answer: 'B',
    },
    {
      stepId: 's3',
      kind: 'play',
      grid: { cols: 4, rows: 4 },
      start: { x: 0, y: 3 },
      goal: { x: 3, y: 0 },
      walls: [{ x: 2, y: 2 }],
      allowedCommands: ['up', 'down', 'left', 'right'],
      maxCommands: 8,
    },
    { stepId: 's4', kind: 'summary', text: 'めいれいの じゅんばんが だいじ' },
  ],
};
