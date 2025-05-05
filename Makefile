.PHONY: test coverage mkdir clean build watch start stop run exec version major minor patch status

NAME = ghost-gcs
BUCKET = $(GCS_TEST_BUCKET)
DIR := $(shell git rev-parse --show-toplevel)
VERSION = 5.118.1
ADC = $(HOME)/.config/gcloud/application_default_credentials.json
DOCKER_ARGS = --name $(NAME) \
	-p 2368:2368 \
	--env-file $(DIR)/tests/.env \
	-e GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/key.json \
	-e NODE_ENV=development \
	-e storage__gcs__bucket=$(BUCKET) \
	-e storage__gcs/files__bucket=$(BUCKET) \
	-e storage__gcs/media__bucket=$(BUCKET) \
	-v $(NAME)-data:/var/lib/ghost/current/content \
	-v $(DIR):/var/lib/ghost/current/core/server/adapters/storage/gcs \
	-v $(ADC):/var/secrets/google/key.json \
	-v $(DIR)/tests/config.json:/var/lib/ghost/config.development.json
ARGS = /bin/bash
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

start: build
	@docker run -d $(DOCKER_ARGS) ghost:$(VERSION)

stop:
	@docker stop $(NAME) && docker rm $(NAME)

run: build
	@docker run --rm -it $(DOCKER_ARGS) ghost:$(VERSION)

exec: build
	@docker run --rm -it $(DOCKER_ARGS) --entrypoint= ghost:$(VERSION) $(ARGS)

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
