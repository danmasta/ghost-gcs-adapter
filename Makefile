.PHONY: test coverage mkdir clean build watch version major minor patch status

SEMVER = patch

test:
	node_modules/.bin/mocha tests

coverage:
	node_modules/.bin/c8 --reporter=lcov node_modules/.bin/mocha tests

mkdir:
	@mkdir -p dist

clean:
	@rm -rf dist/*

build: mkdir clean
	node_modules/.bin/rollup -c

watch: mkdir clean
	node_modules/.bin/rollup -c -w

version: status
	@npm version $(SEMVER)

major: SEMVER = major
major: version

minor: SEMVER = minor
minor: version

patch: SEMVER = patch
patch: version

status:
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "Git tree not clean"; \
		exit 1; \
	fi
