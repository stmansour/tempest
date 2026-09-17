# ─────────────────────────────────────────────────────────────────────────────
# Atari Tempest (1981) QuadraScan Arcade — Makefile
# ─────────────────────────────────────────────────────────────────────────────

DIRS           := css js images
APP            := tempest
DIST           := dist
CANDIDATES_DIR := candidates

# Remote server deployment (matching rubiks / bernie conventions)
SSH_KEY        := ~/.ssh/id_sman
SSH_PORT       := 1291
SSH_HOST       := sman@stevemansour.com
REMOTE         := ~/public_html/games/tempest

# Absolute path for dist (for passing to submakes)
DIST_ABS       := $(shell pwd)/$(DIST)

export TEMPEST_DIST := $(DIST_ABS)

define write-tempest-version
	VER="1.0.0-$$(date -u +%Y%m%dT%H%M%S)"; \
	printf '%s\n' "$$VER" > ${CANDIDATES_DIR}/tempest-version.txt; \
	echo "*** $(APP): Tempest version $$VER ***"
endef

define stamp-tempest-index
	if [ -f ${CANDIDATES_DIR}/tempest-version.txt ]; then \
		VER=$$(tr -d '[:space:]' < ${CANDIDATES_DIR}/tempest-version.txt); \
	else \
		VER=$$(cksum $(1)/js/tempest.js | awk '{print $$1}'); \
	fi; \
	sed -e "s|href=\"style.css\"|href=\"css/tempest.css?v=$$VER\"|" \
	    -e "s|href=\"css/style.css\"|href=\"css/tempest.css?v=$$VER\"|" \
	    -e "s|src=\"js/main.js[^\"]*\"|src=\"js/tempest.js?v=$$VER\"|" \
	    -e "s|<script type=\"module\" src=\"js/tempest.js|<script src=\"js/tempest.js|" \
	    index.html > $(1)/index.html
endef

.PHONY: all build package clean validate serve play release relsman help

all: build package

build: code validate

code:
	@echo "Building aggregated JavaScript and CSS files..."
	rm -rf ${CANDIDATES_DIR}
	mkdir -p ${CANDIDATES_DIR}
	$(call write-tempest-version)
	touch ${CANDIDATES_DIR}/tempest.css
	touch ${CANDIDATES_DIR}/tempest.js

	# Build all subdirectories, aggregating into candidates directory
	for dir in $(DIRS); do \
		$(MAKE) -C $$dir build || exit 1; \
	done

	@echo "Checking JavaScript syntax and detecting duplicates..."
	@if command -v npm >/dev/null 2>&1; then \
		npm run lint; \
		if [ -f ${CANDIDATES_DIR}/tempest.js ]; then \
			echo "Checking aggregated tempest.js for duplicate function names..."; \
			npx eslint ${CANDIDATES_DIR}/tempest.js --rule "no-dupe-keys: error" --rule "no-func-assign: error" --rule "no-redeclare: off" --rule "no-unused-vars: off" || (echo "ERROR: Duplicate function names detected in aggregated file!"; exit 1); \
		fi; \
	fi
	@echo "*** $(APP): completed build ***"


validate:
	@echo "Validating JavaScript files (syntax + lint)..."
	@if command -v npm >/dev/null 2>&1; then \
		npm run validate; \
	fi
	@echo "*** $(APP): completed validate ***"

package: 
	@echo "Packaging Tempest distribution into $(DIST)/..."
	mkdir -p $(DIST)
	mkdir -p $(DIST)/js
	mkdir -p $(DIST)/css

	# Copy aggregated single JS and single CSS file
	cp ${CANDIDATES_DIR}/tempest.js $(DIST)/js/
	cp ${CANDIDATES_DIR}/tempest.css $(DIST)/css/

	# Package images and assets from subdirectories
	for dir in $(DIRS); do \
		$(MAKE) -C $$dir package || exit 1; \
	done

	# Stamp index.html with content version hashes into dist/index.html
	$(call stamp-tempest-index,$(DIST))
	@echo "*** $(APP): completed package — $(DIST)/ ready ***"

clean:
	rm -rf $(CANDIDATES_DIR)
	rm -rf $(DIST)
	for dir in $(DIRS); do \
		$(MAKE) -C $$dir clean || exit 1; \
	done
	@echo "*** $(APP): completed clean ***"

play: serve

# Preview the production distribution locally
serve: package
	python3 -m http.server 8088 --directory $(DIST)

# Optional local macOS web server release
release: package
	rm -rf /Library/WebServer/Documents/games/tempest
	mkdir -p /Library/WebServer/Documents/games
	cp -R $(DIST) /Library/WebServer/Documents/games/tempest
	@echo "*** $(APP): completed release — /Library/WebServer/Documents/games/tempest ***"

# Deploy to stevemansour.com (atomic swap via .new directory, matching rubiks/Makefile)
relsman: package
	rsync -az --delete -e "ssh -i $(SSH_KEY) -p $(SSH_PORT)" $(DIST)/ $(SSH_HOST):$(REMOTE).new/
	ssh -i $(SSH_KEY) -p $(SSH_PORT) $(SSH_HOST) 'rm -rf $(REMOTE).bak && mv $(REMOTE) $(REMOTE).bak 2>/dev/null; mv $(REMOTE).new $(REMOTE) && rm -rf $(REMOTE).bak'
	@echo "*** $(APP): completed relsman — live at https://stevemansour.com/games/tempest/ ***"

help:
	@echo ""
	@echo "  make           — build production bundle into dist/ (single JS, single CSS, images)"
	@echo "  make build     — aggregate files into candidates/ and run linters"
	@echo "  make package   — package into dist/ with version-stamped index.html"
	@echo "  make validate  — run ESLint and code checkers"
	@echo "  make clean     — remove dist/, candidates/, and temporary build files"
	@echo "  make serve     — serve dist/ locally at http://localhost:8088"
	@echo "  make release   — copy dist/ to local macOS web server"
	@echo "  make relsman   — deploy to stevemansour.com via rsync and atomic ssh swap"
	@echo ""
