#pragma once
#include <cstdint>

// N-API publishes JavaScript numbers. Unknown or contradictory lengths must
// remain indeterminate, rather than become a fabricated completion percent.
struct SUDownloadProgress {
  static constexpr uint64_t maximumSafeInteger = 9007199254740991ULL;
  uint64_t received = 0;
  uint64_t total = 0;
  bool overflow = false;
  void reset() { received = 0; total = 0; overflow = false; }
  void add(uint64_t length) {
    if (overflow) return;
    if (length > maximumSafeInteger - received) { overflow = true; return; }
    received += length;
  }
  bool hasTotal() const { return !overflow && total > 0 && total <= maximumSafeInteger && total >= received; }
};
