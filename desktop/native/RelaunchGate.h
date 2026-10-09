#import <Foundation/Foundation.h>

// Sparkle owns installation. This gate only holds its continuation until the
// main-process controller confirms that task admission and shutdown are safe.
@interface SURelaunchGate : NSObject
@property(nonatomic, readonly, copy) NSString *token;
- (NSString *)defer:(void (^)(void))continuation;
- (BOOL)resume:(NSString *)token;
- (void)invalidate;
@end
