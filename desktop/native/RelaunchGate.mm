#import "RelaunchGate.h"

@implementation SURelaunchGate {
  NSString *_token;
  void (^_continuation)(void);
}
- (NSString *)token { return _token; }
- (NSString *)defer:(void (^)(void))continuation {
  NSParameterAssert([NSThread isMainThread]);
  _continuation = [continuation copy];
  _token = [[NSUUID UUID] UUIDString];
  return _token;
}
- (BOOL)resume:(NSString *)token {
  NSParameterAssert([NSThread isMainThread]);
  if (!_continuation || !_token || ![_token isEqualToString:token]) return NO;
  void (^continuation)(void) = _continuation;
  // Consume before invocation: Sparkle may synchronously re-enter its delegate.
  [self invalidate];
  continuation();
  return YES;
}
- (void)invalidate {
  NSParameterAssert([NSThread isMainThread]);
  _continuation = nil;
  _token = nil;
}
@end
