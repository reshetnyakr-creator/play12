# WIP emergency checkpoint — 2026-11-19

User ordered an immediate stop to development, testing and UI fixes. This checkpoint is NOT accepted and NOT published. Do not update main from this checkpoint without resuming the outstanding acceptance work.

## Preserved state

- Feature branch parent: 2dffc9b79ae26560d063a5d3e1788e99a8363f2f. Its complete application tree, recovery instructions and saved evidence are preserved unchanged.
- The former Linux environment /workspace/scratch/9200591059ed/play12 and /workspace/shared/play12-acceptance are unavailable in the current session. No claim is made that inaccessible files or later transient browser results have been recovered.
- The available Mac workspace work/mobile-tablet-ux contains an earlier 167-file snapshot without git metadata. It is archived byte-for-byte under mac-workspace/ rather than overwriting the newer application files. manifest.json records each original relative path, Git blob SHA and byte count. All archived blobs were retained or uploaded and checked against these hashes.
- Previous recovery/acceptance status remains in MVP/docs/mobile-tablet-resume-20261119.md. Browser acceptance remains incomplete. Prior transient runs are not new verification of this checkpoint.
- No development, test execution, UI correction or deployment was performed during emergency saving.
- main and both rollback branches must remain unchanged.

The archived Mac snapshot is recovery material, not a deployable replacement of the current application. Work is stopped after verifying the checkpoint branch ref and archived tree.
