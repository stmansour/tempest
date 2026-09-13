THISDIR="images"
CANDIDATES_DIR=../candidates

build:
	@echo "*** $(THISDIR): completed build ***"

package:
	# Copy all images to the distribution directory
	mkdir -p $(TEMPEST_DIST)/images
	cp -r * $(TEMPEST_DIST)/images/ 2>/dev/null || true
	# Remove the Makefile if it got copied
	rm -f $(TEMPEST_DIST)/images/Makefile
	@echo "*** $(THISDIR): completed package ***"

release:
	# Copy all images to the distribution directory
	mkdir -p $(TEMPEST_DIST)/images
	cp -r * $(TEMPEST_DIST)/images/ 2>/dev/null || true
	# Remove the Makefile if it got copied
	rm -f $(TEMPEST_DIST)/images/Makefile
	@echo "*** $(THISDIR): completed release ***"

clean:
	@echo "*** $(THISDIR): completed clean ***"

test:
	@echo "*** $(THISDIR): completed test ***"
