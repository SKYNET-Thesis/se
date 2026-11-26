# Question Bank import — instructor guide

Where: Course Builder → lesson → Quiz Builder → Questions → **Import questions**. Download the official template (XLSX or CSV) from the dialog; `docs/education/Question_Bank_Template.xlsx` is the same file.

## Columns

| Column | Required | Notes |
|---|---|---|
| `type` | yes | `single_choice`, `multiple_choice` or `true_false` |
| `stem` | yes | Question text |
| `option_a` … `option_f` | for choice types | At least two, filled in order. **Leave empty for `true_false`** |
| `correct` | yes | Letters, e.g. `A` or `A;C;D`. For `true_false`: `true` / `false` (`T`/`F`/`yes`/`no` accepted) |
| `explanation` | yes | Shown after submission, subject to the quiz disclosure policy |
| `difficulty` | no | `easy` / `medium` / `hard` (default `medium`) |
| `cognitive_level` | no | remember, understand, apply, analyze, evaluate, create (default understand) |
| `points` | no | Positive, up to 2 decimals. **If empty the default applies: easy 1, medium 2, hard 3.** An explicit value is always kept. You can change points when adding the question to a quiz |
| `code` | no | Your own question code; if empty a deterministic code is generated from the file |
| `topic` | no | Stored on the question (max 120 chars) |
| `learning_objective` | no | A Learning Outcome **code** of this lesson (e.g. `LO-1`). Rows without it use the outcome you choose in the dialog |
| `course`, `lesson`, `learning_section` | no | Optional cross-checks: `course` = course title, `lesson` = lesson number or title, `learning_section` = a section title of this lesson. A row that names something else is **excluded with a reason** — it is never moved to another lesson |
| `source_reference` | no | Free text; the import adds an audit reference (`import:<file hash>:row<N>`) |

## Steps

1. Upload the file. Nothing is saved yet: the preview lists each row as valid, invalid or duplicate, with points (and whether they are the default), topic and mapping, and row-level errors.
2. Fix problems in your file and upload again, or use **Download error report (CSV)**.
3. Choose a Learning Outcome for rows without `learning_objective`, tick *I reviewed this preview*, and import.
4. Questions are imported as **drafts** unless you tick *Publish immediately*. Review and publish them before adding them to a quiz. **Known limitation (Production E2E D05):** the web app currently has no screen that publishes a draft question and the quiz builder lists published questions only; tick *Publish immediately* for questions you will use in a quiz.

## Safety and limits

Max 1 MB and 500 rows; `.csv` and `.xlsx` only; formulas, macros and external references are never evaluated. Only authors of the owning school (or a System Administrator) can import; other schools get "not found". The import is bound to the file you previewed (SHA-256), is re-validated when you confirm, and repeating the same file reports its rows as duplicates instead of creating copies. Existing questions are never overwritten and earlier versions and attempts are untouched. Rows succeed or fail independently and the result shows imported / skipped / failed counts.
