<!-- deno-fmt-ignore-file -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2021-08-25
### Changed
- Replaced option `dir` with `dest`.

### Fixed
- Log downloaded files.
- Unzip subfolders.

## [0.2.1] - 2021-08-18
### Added
- Support for urls, to download a file.
- New option `dir`.

### Fixed
- Support for files starting with `/` or `./`.

## [0.2.0] - 2021-08-09
### Added
- New option `filter`.

### Changed
- Use `JSZip` library to uncompress zip files, instead commands, for more compatibility.
- If `files` is not defined and the repo has not `package.json`, download all files.

## 0.1.0 - 2021-08-07
The first version.

[0.3.0]: https://github.com/oscarotero/gpm/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/oscarotero/gpm/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/oscarotero/gpm/compare/v0.1.0...v0.2.0
