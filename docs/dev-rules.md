# 開発ルール（詳細）

PROJECT.md「3. 開発ルール」「4. Issue 管理」の詳細部をここに移動（Issue #447）。

## コーディング規則

- **ファイル名**: 小文字統一
- **変数命名**: camelCase
- **クラス**: PascalCase
- **定数**: UPPER_SNAKE_CASE
- **コメント**: 最小限（WHY が非自明な場合のみ）

## Issue ラベル分類

- `feature`: 新機能
- `bug`: バグ修正
- `refactor`: リファクタリング
- `docs`: ドキュメント

## 他プロジェクトからのコード再利用

project-template の PROJECT.md の4条件を満たす場合のみコピー可。出典コメント
（コミットハッシュ）を冒頭に必須記載し、以後は独立資産として扱う。
