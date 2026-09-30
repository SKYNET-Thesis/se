# Local Episode Capture Design

## Goal
Give the CHECKIK Recording screen two mandatory live camera views—one wrist camera and one head camera—and persist completed episode metadata locally. Cloud publishing is intentionally deferred.

## Scope
- The Recording screen selects exactly one wrist camera (`left-wrist` or `right-wrist`) and one head view (`front` or `overhead`), whether connected or offline, so both safety-critical feed classes remain visible.
- Both feeds remain visible while recording and reuse `CameraFeedCard`, whose stream source is the configured local backend.
- Recording cannot start unless both required views are connected and a task description is present.
- Saving an episode records the selected camera identifiers, duration, arm mode, task description, and notes in browser-local dataset state.
- The completion UI explicitly states that the episode remains local. No Hugging Face or Kaggle UI is shown in this phase.

## Non-goals
- No fake cloud upload buttons.
- No storage of Hugging Face or Kaggle credentials.
- No claim that browser state is durable episode media storage; the existing backend must provide actual stream/recording APIs before media can be persisted.

## Interface
`Recording.tsx` derives `wristCamera` and `headCamera` from configured cameras, renders those two `CameraFeedCard` instances, and computes `camerasReady` only when both are connected. `configReady` additionally requires `camerasReady`; its blocked reason names the missing camera class.

`saveRecordedEpisode` accepts the same persisted episode summary as today, with the saved camera count fixed to two in this flow. This is intentionally compatible with the current `DatasetEpisode` model.

## Error handling
- Missing/offline wrist or head camera: show the existing no-signal card and disable Start recording.
- Camera disconnect observed through state refresh: the next Start is blocked. A real recorder must independently terminate/mark incomplete on stream failure; that backend is absent in this repository.

## Verification
- Add a pure selection helper with Node tests for selecting preferred wrist/head cameras and rejecting missing/offline categories.
- Run frontend lint/build.
- Run the Vite application and use Playwright to confirm both camera panels and the disabled Start state when the two required feeds are absent.
