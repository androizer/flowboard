.PHONY: test
test:
	@trap 'docker compose -f compose.test.yml down' EXIT; \
	  docker compose -f compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
