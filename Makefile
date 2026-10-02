


QUX_PUBLIC_PATH ?= /quant-ux/
QUX_TEST_IMAGE ?= quant-ux-test



build-prod:
	docker build --build-arg QUX_PUBLIC_PATH=$(QUX_PUBLIC_PATH) --target runtime-production -t quant-ux .

build-dev:
	docker build --target runtime-development -t quant-ux .


up:
	 docker compose --file docker/docker-compose.yml up -d

down:
	 docker compose --file docker/docker-compose.yml down


# Run the unit tests. src/ and tests/ are bind mounted, so the image builds once
# and then stays cached while you edit source. Extra args pass through, e.g.
# make test ARGS="--runInBand -t WidgetTreeUtil"
test-deps:
	docker build --target test-deps -t $(QUX_TEST_IMAGE) .

test: test-deps
	docker run --rm \
		-v $(CURDIR)/src:/home/node/src \
		-v $(CURDIR)/tests:/home/node/tests \
		$(QUX_TEST_IMAGE) npm run test:unit $(ARGS)

# Lint the same two trees inside the test image. --no-fix, because src/ and
# tests/ are bind mounted and we do not want the container rewriting them.
lint: test-deps
	docker run --rm \
		-v $(CURDIR)/src:/home/node/src \
		-v $(CURDIR)/tests:/home/node/tests \
		$(QUX_TEST_IMAGE) npm run lint -- --no-fix $(ARGS)