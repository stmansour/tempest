THISDIR="js"
CANDIDATES_DIR=../candidates

JS_FILES = \
	vector_font.js \
	web.js \
	audio.js \
	input.js \
	player.js \
	enemies.js \
	renderer.js \
	game.js \
	main.js

build:
	# Concatenate all JS files in dependency order into candidates/tempest.js
	@for f in $(JS_FILES); do \
		sed -e 's/^import .* from .*;//g' -e 's/^export //g' "$$f" >> ${CANDIDATES_DIR}/tempest.js; \
		echo "" >> ${CANDIDATES_DIR}/tempest.js; \
	done
	@echo "*** $(THISDIR): completed build ***"

package:
	@echo "*** $(THISDIR): completed package ***"

release:
	@echo "*** $(THISDIR): completed release ***"

clean:
	@echo "*** $(THISDIR): completed clean ***"

test:
	node -c $(JS_FILES)
	@echo "*** $(THISDIR): completed test ***"
