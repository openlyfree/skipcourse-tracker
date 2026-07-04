# Change Log

All notable changes to the "skipcourse-tracker" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Added structured logging and an Output Channel for better diagnostics.
- Added configuration settings: `skipcourse-tracker.browserPath`, `skipcourse-tracker.profilePath`, and `skipcourse-tracker.headed`.
- Added `skipcourse-tracker.resetProfile` command to remove the stored Playwright profile and force re-login.
- Improved Windows compatibility: profile path resolution, broader browser search (Chrome/Edge/Brave), and Playwright fallback to bundled browser.
- Tracker now skips binary files and very large files (>5MB) to avoid upload failures.

- Initial release
