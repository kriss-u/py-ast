# [1.16.0](https://github.com/kriss-u/py-ast/compare/v1.15.1...v1.16.0) (2026-08-18)


### Bug Fixes

* expand the tree block automatically on typing [skip ci] ([27f6884](https://github.com/kriss-u/py-ast/commit/27f688489c5c855bf397b13d0ee323a520dc5692))
* move badge to the border corner [skip ci] ([a7bb012](https://github.com/kriss-u/py-ast/commit/a7bb012b058ec4d9e44f529c5d388e6c9a9bcb17))
* remove the jitter when typing on code editor [skip ci] ([da29a56](https://github.com/kriss-u/py-ast/commit/da29a5627b2d8e630e6413b0e6587fc49551c89f))
* update jsr json file on publish [skip ci] ([0a48f57](https://github.com/kriss-u/py-ast/commit/0a48f575052ce7b8745d6aeab939508f75261805))


### Features

* add cyclomatic complexity flow analysis on playground [skip ci] ([bf80f8c](https://github.com/kriss-u/py-ast/commit/bf80f8ce9892090b63f21b9f1bf526624c9725db))
* **playground:** add persistence using indexeddb [skip ci] ([0aa1ebb](https://github.com/kriss-u/py-ast/commit/0aa1ebbd54e15aedc74b9a349fc24d3b4a212bec))

## [1.15.1](https://github.com/kriss-u/py-ast/compare/v1.15.0...v1.15.1) (2026-08-16)


### Bug Fixes

* fix f-string brace-tracking and other bugs ([468c5ac](https://github.com/kriss-u/py-ast/commit/468c5acda3065503443018402661812b7f74bbaf))
* make tree and json view consistent [skip ci] ([ea4188c](https://github.com/kriss-u/py-ast/commit/ea4188cc8583f327fd631984751ee79b95869578))
* use start for highlighting [skip ci] ([68b0fde](https://github.com/kriss-u/py-ast/commit/68b0fde5082e8bdd70f67ab8994a41a6585bc9e3))

# [1.15.0](https://github.com/kriss-u/py-ast/compare/v1.14.0...v1.15.0) (2026-08-15)


### Bug Fixes

* add more roundtrip fixes ([b5e7204](https://github.com/kriss-u/py-ast/commit/b5e7204979247a3b03edb78b858c797a20c1be7d))
* fix escaping on strings ([ef6109d](https://github.com/kriss-u/py-ast/commit/ef6109df5f8345ef069700e140be4c82b41a9194))
* fix few value mismatch issue ([a56866e](https://github.com/kriss-u/py-ast/commit/a56866e7be213a8d0027b26a311ee41b83d4bf53))
* fix unicode length issue ([467b4e7](https://github.com/kriss-u/py-ast/commit/467b4e7cdd632d82628cf0c79af7de01f1d87f31))
* remove lib from gitignore [skip ci] ([e78a24a](https://github.com/kriss-u/py-ast/commit/e78a24a4ede02843d54475b9c23143ea03050c05))
* support more edge cases expressions ([072c3b3](https://github.com/kriss-u/py-ast/commit/072c3b3b8a9c79c2302c7ee2bd3b46cffd3b4f0c))


### Features

* add corpus test against stdlib ([a3c257f](https://github.com/kriss-u/py-ast/commit/a3c257f4027d076625d05f17584521e0aa38e929))
* add support for bare generator expression ([18aff47](https://github.com/kriss-u/py-ast/commit/18aff4741a1a45e4e9138e7cf108a6d88e5b9b3b))

# [1.14.0](https://github.com/kriss-u/py-ast/compare/v1.13.0...v1.14.0) (2026-08-15)


### Features

* add end column and start column and fix in playground ([a9530a6](https://github.com/kriss-u/py-ast/commit/a9530a609c1940e4e7a179586efdca935893d2f8))
* add playground [skip ci] ([da4e4e3](https://github.com/kriss-u/py-ast/commit/da4e4e32695d050688f21a89b008a0f500cce5e1))
* make responsive and add assets ([7502f8d](https://github.com/kriss-u/py-ast/commit/7502f8daa3b0b7207f9d9da3d04adc64f1f5bbaf))

# [1.13.0](https://github.com/kriss-u/py-ast/compare/v1.12.0...v1.13.0) (2026-08-14)


### Features

* add more pattern-matching cases ([e7b9442](https://github.com/kriss-u/py-ast/commit/e7b94424be1f066706d9d73ba553513481e384e1))
* make parser stricter and remove fallbacks ([df505e0](https://github.com/kriss-u/py-ast/commit/df505e085c9a4e9cedfccd78eec68539de9846e4))

# [1.12.0](https://github.com/kriss-u/py-ast/compare/v1.11.1...v1.12.0) (2026-08-14)


### Features

* add support for self-documenting f-string ([f4af674](https://github.com/kriss-u/py-ast/commit/f4af67447461fe3871065144c7c6b3abf4da9e89))
* add support for t-strings ([ef7c1f1](https://github.com/kriss-u/py-ast/commit/ef7c1f155a5e0167abd15726493bffa7bfd24653))

## [1.11.1](https://github.com/kriss-u/py-ast/compare/v1.11.0...v1.11.1) (2026-08-11)


### Bug Fixes

* correctly associate the order of operations ([7e51cb0](https://github.com/kriss-u/py-ast/commit/7e51cb0c3c64ededaf40fb469299da5d2baf2c63))
* parse statements inside f-strings correctly ([49c3da1](https://github.com/kriss-u/py-ast/commit/49c3da1a7ae3a0b757d756b931a88f2054d0988b))

# [1.11.0](https://github.com/kriss-u/py-ast/compare/v1.10.1...v1.11.0) (2026-08-11)


### Bug Fixes

* add support for lambda *args, **kwargs ([bb9e8a6](https://github.com/kriss-u/py-ast/commit/bb9e8a601232e1cb4658b13f59185ba2da38b33b))
* match multiple newlines after decorators ([efa202c](https://github.com/kriss-u/py-ast/commit/efa202c02601b104e6c5e711b3d85373ab4c3bb5))
* parse *args, **kwargs anywhere ([6586b81](https://github.com/kriss-u/py-ast/commit/6586b819425768f2fda84470aee35476d47ae7f4))
* parse context similar to CPython ([250f37f](https://github.com/kriss-u/py-ast/commit/250f37f8f848bd0739d3fd13e6a2cb9b94b1e7be))


### Features

* add support for complex numbers ([bbeaa99](https://github.com/kriss-u/py-ast/commit/bbeaa99057043ed719d8b3c7d6e5df47157b4c77))
* add support for multiple for/if clauses ([971ce01](https://github.com/kriss-u/py-ast/commit/971ce012e0a106f1dae5fa1ea2e40e546dacff27))
* add support for nested fstring and augmented assignment ([9382d9e](https://github.com/kriss-u/py-ast/commit/9382d9e20516e9ec428682e7c760340fe102e3a9))
* add support for walrus syntax ([7749c5e](https://github.com/kriss-u/py-ast/commit/7749c5eb02333f33c91c468e108c5ede2a84f455))

## [1.10.1](https://github.com/kriss-u/py-ast/compare/v1.10.0...v1.10.1) (2026-08-11)


### Bug Fixes

* remove unused version constant ([192c21a](https://github.com/kriss-u/py-ast/commit/192c21aaf1eb10614bed227c7df0e17524e69def))

# [1.10.0](https://github.com/kriss-u/py-ast/compare/v1.9.2...v1.10.0) (2026-08-11)


### Features

* add badges on README ([389724e](https://github.com/kriss-u/py-ast/commit/389724e47c27bbc0c15aaf4eca38cd45052ad572))

## [1.9.2](https://github.com/kriss-u/py-ast/compare/v1.9.1...v1.9.2) (2026-08-10)


### Bug Fixes

* exclude package-lock.json from biome format in lint-staged ([e533c11](https://github.com/kriss-u/py-ast/commit/e533c112e28c3231d2b121a117785a606ef7e3ac))

## [1.9.1](https://github.com/kriss-u/py-ast/compare/v1.9.0...v1.9.1) (2026-08-10)


### Bug Fixes

* raise error two statements without indent or dedent ([dfe65dd](https://github.com/kriss-u/py-ast/commit/dfe65dd5723e957b0d5bdf43c170a9078555d7dd))

# [1.9.0](https://github.com/kriss-u/py-ast/compare/v1.8.1...v1.9.0) (2025-08-04)


### Features

* handle nested string ([fe10cb6](https://github.com/kriss-u/py-ast/commit/fe10cb68af574232157ab9d7d4a0072b8fa55b77))
* handle quotes as original ([404849c](https://github.com/kriss-u/py-ast/commit/404849c575ebb3bd9a890aaeebdbea1d4a0ed0f8))

## [1.8.1](https://github.com/kriss-u/py-ast/compare/v1.8.0...v1.8.1) (2025-08-04)


### Bug Fixes

* preserve parenthesis on precedence ([f6224d4](https://github.com/kriss-u/py-ast/commit/f6224d4fca7763f8a85a1cc9b000d9cf422b6002))

# [1.8.0](https://github.com/kriss-u/py-ast/compare/v1.7.0...v1.8.0) (2025-08-04)


### Features

* handle indentation size and comments properly ([b0bea39](https://github.com/kriss-u/py-ast/commit/b0bea3995fea93c27692db2f025cd576ffa554bc))

# [1.7.0](https://github.com/kriss-u/py-ast/compare/v1.6.0...v1.7.0) (2025-08-04)


### Bug Fixes

* fix the indent issue when comments are present ([808b69f](https://github.com/kriss-u/py-ast/commit/808b69fa1de212377100167dcf2bc044791015fb))


### Features

* add support for comments ([b020b15](https://github.com/kriss-u/py-ast/commit/b020b1506be2136c4911cdd6a80ef7b7f4bf8520))

# [1.6.0](https://github.com/kriss-u/py-ast/compare/v1.5.0...v1.6.0) (2025-08-03)


### Features

* add support for match case ([fdb09ee](https://github.com/kriss-u/py-ast/commit/fdb09ee1df6448ca70e3d492aafa74c3391eabe0))

# [1.5.0](https://github.com/kriss-u/py-ast/compare/v1.4.2...v1.5.0) (2025-08-03)


### Bug Fixes

* properly parse and unparse generators ([b7e732b](https://github.com/kriss-u/py-ast/commit/b7e732b2a04a3b2483b61bdb9a24ad8c61cfabac))


### Features

* add support for async for ([6a47b28](https://github.com/kriss-u/py-ast/commit/6a47b28245bb485d96308b1b5c0bf244b305756d))

## [1.4.2](https://github.com/kriss-u/py-ast/compare/v1.4.1...v1.4.2) (2025-08-03)


### Bug Fixes

* remove circular dependency on comments checking ([f9b104f](https://github.com/kriss-u/py-ast/commit/f9b104fd68bae56d996e57c6637e72f80cc36f20))

## [1.4.1](https://github.com/kriss-u/py-ast/compare/v1.4.0...v1.4.1) (2025-08-03)


### Bug Fixes

* properly unparse f string ([c3bf9d4](https://github.com/kriss-u/py-ast/commit/c3bf9d4cab9b4a1bfa17c82d008521ecc2b9fe6d))

# [1.4.0](https://github.com/kriss-u/py-ast/compare/v1.3.0...v1.4.0) (2025-08-02)


### Bug Fixes

* properly handle modern python features such as metaclass and parenthesis import ([df08de9](https://github.com/kriss-u/py-ast/commit/df08de9d579d6475fc494f0430ecb4b128f70f73))


### Features

* add support for type variables ([44b7922](https://github.com/kriss-u/py-ast/commit/44b7922d6f499741717d95b5414756a988df7621))

# [1.3.0](https://github.com/kriss-u/py-ast/compare/v1.2.0...v1.3.0) (2025-08-02)


### Bug Fixes

* resolve semantic-release version conflict ([12d8e52](https://github.com/kriss-u/py-ast/commit/12d8e52f910e7d977db9c7a64d7058fa711ca34d))


### Features

* add mock script to force release to 1.3.0 ([a87e13f](https://github.com/kriss-u/py-ast/commit/a87e13f71612d503c63feeb9cb36f6ef315d0e42))

# [1.2.0](https://github.com/kriss-u/py-ast/compare/v1.1.0...v1.2.0) (2025-08-02)


### Bug Fixes

* resolve semantic-release version conflict ([12d8e52](https://github.com/kriss-u/py-ast/commit/12d8e52f910e7d977db9c7a64d7058fa711ca34d))


### Features

* add commit lint and use conventional commit ([42fd244](https://github.com/kriss-u/py-ast/commit/42fd244a562e8707b43bb4d66428b2d3162f41f2))
* add latest version manually ([825293b](https://github.com/kriss-u/py-ast/commit/825293b5393be35d886705283d86316d3a70c532))
* add latest version manually ([64d7f55](https://github.com/kriss-u/py-ast/commit/64d7f557351ecdfc731814f15625f0ef2fc8f530))
* commit after syncing version on jsr ([4226654](https://github.com/kriss-u/py-ast/commit/422665442841131f28c2842646d455f7b07c1b23))
* increase version number ([56945d6](https://github.com/kriss-u/py-ast/commit/56945d652e34f45776163f483b129b4aa0c9a7f9))

# [1.2.0](https://github.com/kriss-u/py-ast/compare/v1.1.0...v1.2.0) (2025-08-01)


### Features

* add commit lint and use conventional commit ([42fd244](https://github.com/kriss-u/py-ast/commit/42fd244a562e8707b43bb4d66428b2d3162f41f2))
* add latest version manually ([825293b](https://github.com/kriss-u/py-ast/commit/825293b5393be35d886705283d86316d3a70c532))
* add latest version manually ([64d7f55](https://github.com/kriss-u/py-ast/commit/64d7f557351ecdfc731814f15625f0ef2fc8f530))
* commit after syncing version on jsr ([4226654](https://github.com/kriss-u/py-ast/commit/422665442841131f28c2842646d455f7b07c1b23))
* increase version number ([56945d6](https://github.com/kriss-u/py-ast/commit/56945d652e34f45776163f483b129b4aa0c9a7f9))

# [1.2.0](https://github.com/kriss-u/py-ast/compare/v1.1.0...v1.2.0) (2025-08-01)


### Features

* add commit lint and use conventional commit ([42fd244](https://github.com/kriss-u/py-ast/commit/42fd244a562e8707b43bb4d66428b2d3162f41f2))
* add latest version manually ([825293b](https://github.com/kriss-u/py-ast/commit/825293b5393be35d886705283d86316d3a70c532))
* add latest version manually ([64d7f55](https://github.com/kriss-u/py-ast/commit/64d7f557351ecdfc731814f15625f0ef2fc8f530))
* commit after syncing version on jsr ([4226654](https://github.com/kriss-u/py-ast/commit/422665442841131f28c2842646d455f7b07c1b23))

# [1.1.0](https://github.com/kriss-u/py-ast/compare/v1.0.0...v1.1.0) (2025-08-01)


### Features

* remove type comments and type ignore from the parser ([4c37baa](https://github.com/kriss-u/py-ast/commit/4c37baa476c3fdb8ad9031034d122a1b007bd668))

# 1.0.0 (2025-08-01)


### Features

* add code first first release ([302270f](https://github.com/kriss-u/py-ast/commit/302270fd1042a5e7b8d68693ef6a955dc9d4b80a))
* add commit lint and use conventional commit ([335f384](https://github.com/kriss-u/py-ast/commit/335f38411bcdd2ca09b83b51b56d72815c7d40f6))
* add husky ([af8b621](https://github.com/kriss-u/py-ast/commit/af8b621495d465f524804ff9f6a653b38e308927))
