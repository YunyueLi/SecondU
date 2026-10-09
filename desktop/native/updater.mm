#import <Cocoa/Cocoa.h>
#import <Sparkle/Sparkle.h>
#import "RelaunchGate.h"
#include "DownloadProgress.h"
#include <node_api.h>
#include <cstring>

static napi_value ToJS(napi_env env, id value) {
  napi_value result;
  if (!value || value == [NSNull null]) { napi_get_null(env, &result); return result; }
  if ([value isKindOfClass:[NSString class]]) { napi_create_string_utf8(env, [value UTF8String], NAPI_AUTO_LENGTH, &result); return result; }
  if ([value isKindOfClass:[NSNumber class]]) {
    if (CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) napi_get_boolean(env, [value boolValue], &result);
    else napi_create_double(env, [value doubleValue], &result);
    return result;
  }
  napi_create_object(env, &result);
  for (NSString *key in value) napi_set_named_property(env, result, key.UTF8String, ToJS(env, value[key]));
  return result;
}
static void Deliver(napi_env env, napi_value callback, void *, void *data) {
  NSDictionary *event = CFBridgingRelease(data);
  if (!env || !callback) return;
  napi_handle_scope scope; napi_open_handle_scope(env, &scope);
  napi_value argument = ToJS(env, event), receiver, ignored;
  napi_get_undefined(env, &receiver);
  napi_call_function(env, receiver, callback, 1, &argument, &ignored);
  napi_close_handle_scope(env, scope);
}

@class SUNodeUpdater;
@interface SUProgressUserDriver : SPUStandardUserDriver
@property(nonatomic, weak) SUNodeUpdater *owner;
@end

@interface SUNodeUpdater : NSObject <SPUUpdaterDelegate> {
  SUDownloadProgress _progress;
  NSTimeInterval _lastProgressEvent;
  BOOL _downloadBegan;
}
@property(nonatomic, strong) SPUUpdater *updater;
@property(nonatomic, strong) SUProgressUserDriver *userDriver;
@property(nonatomic, strong) SURelaunchGate *gate;
@property(nonatomic, copy) NSString *phase;
@property(nonatomic, copy) NSString *updateVersion;
@property(nonatomic, strong) NSDictionary *lastError;
@property(nonatomic, copy) NSString *userChoice;
@property(nonatomic, copy) NSString *updateStage;
@property(nonatomic, copy) NSString *noUpdateReason;
@property(nonatomic) napi_threadsafe_function events;
@property(nonatomic) BOOL observing;
- (NSDictionary *)state;
- (void)emit:(NSString *)type extra:(NSDictionary *)extra;
- (void)transition:(NSString *)phase;
- (void)dispose;
- (void)downloadBegan;
- (void)downloadExpected:(uint64_t)length;
- (void)downloadReceived:(uint64_t)length;
@end

@implementation SUNodeUpdater
- (instancetype)init {
  if ((self = [super init])) { _phase = @"idle"; _gate = [SURelaunchGate new]; }
  return self;
}
- (NSDictionary *)state {
  SPUUpdater *updater = self.updater;
  NSMutableDictionary *state = [@{@"engine": @"sparkle", @"engineVersion": @"2.9.6", @"started": @(self.updater != nil), @"phase": self.phase,
    @"canCheckForUpdates": @(updater.canCheckForUpdates), @"sessionInProgress": @(updater.sessionInProgress),
    @"automaticallyChecksForUpdates": @(updater.automaticallyChecksForUpdates), @"automaticallyDownloadsUpdates": @(updater.automaticallyDownloadsUpdates),
    @"awaitingRelaunch": @(self.gate.token != nil), @"canShow": @(self.gate.token != nil || updater.canCheckForUpdates)} mutableCopy];
  if (self.updateVersion) state[@"updateVersion"] = self.updateVersion;
  if (self.lastError) state[@"error"] = self.lastError;
  if (self.userChoice) state[@"userChoice"] = self.userChoice;
  if (self.updateStage) state[@"updateStage"] = self.updateStage;
  if (self.noUpdateReason) state[@"noUpdateReason"] = self.noUpdateReason;
  if (_downloadBegan && [self.phase isEqualToString:@"downloading"] && !_progress.overflow) {
    state[@"downloadedBytes"] = @(_progress.received);
    if (_progress.hasTotal()) state[@"totalBytes"] = @(_progress.total);
  }
  if (updater.lastUpdateCheckDate) state[@"lastCheckedAt"] = @([updater.lastUpdateCheckDate timeIntervalSince1970] * 1000);
  return state;
}
- (void)emit:(NSString *)type extra:(NSDictionary *)extra {
  if (!self.events) return;
  NSMutableDictionary *event = [@{@"type": type, @"state": [self state]} mutableCopy];
  [event addEntriesFromDictionary:extra ?: @{}];
  void *data = (__bridge_retained void *)event;
  if (napi_call_threadsafe_function(self.events, data, napi_tsfn_nonblocking) != napi_ok) CFBridgingRelease(data);
}
- (void)transition:(NSString *)phase { self.phase = phase; [self emit:@"state" extra:nil]; }
- (void)downloadBegan { _downloadBegan = YES; _progress.reset(); _lastProgressEvent = 0; [self emit:@"state" extra:nil]; }
- (void)downloadExpected:(uint64_t)length { _progress.total = length; [self emit:@"state" extra:nil]; }
- (void)downloadReceived:(uint64_t)length {
  _progress.add(length);
  NSTimeInterval now = [NSDate timeIntervalSinceReferenceDate];
  if (now - _lastProgressEvent >= 0.1) { _lastProgressEvent = now; [self emit:@"state" extra:nil]; }
}
- (void)recordError:(NSError *)error {
  self.lastError = @{@"domain": error.domain ?: @"Sparkle", @"code": @(error.code), @"message": error.localizedDescription ?: @"Update failed."};
  [self.gate invalidate]; self.phase = @"error"; [self emit:@"error" extra:nil];
}
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
  [self emit:@"state" extra:nil];
}
- (BOOL)updaterShouldPromptForPermissionToCheckForUpdates:(SPUUpdater *)updater { return NO; }
- (BOOL)updater:(SPUUpdater *)updater mayPerformUpdateCheck:(SPUUpdateCheck)check error:(NSError **)error {
  self.lastError = nil; self.noUpdateReason = nil; [self transition:@"checking"]; return YES;
}
- (void)updater:(SPUUpdater *)updater didFindValidUpdate:(SUAppcastItem *)item {
  self.updateVersion = item.displayVersionString ?: item.versionString; self.userChoice = nil; self.updateStage = @"not-downloaded"; [self transition:@"available"];
}
- (void)updaterDidNotFindUpdate:(SPUUpdater *)updater error:(NSError *)error {
  self.lastError = nil; self.updateVersion = nil; self.updateStage = nil; self.userChoice = nil;
  NSInteger reason = [error.userInfo[SPUNoUpdateFoundReasonKey] integerValue];
  NSArray *reasons = @[@"unknown", @"latest", @"newer-than-feed", @"system-too-old", @"system-too-new", @"unsupported-architecture"];
  self.noUpdateReason = reason >= 0 && reason < (NSInteger)reasons.count ? reasons[reason] : @"unknown";
  [self transition:(reason == SPUNoUpdateFoundReasonOnLatestVersion || reason == SPUNoUpdateFoundReasonOnNewerThanLatestVersion) ? @"up-to-date" : @"no-update"];
}
- (void)updater:(SPUUpdater *)updater userDidMakeChoice:(SPUUserUpdateChoice)choice forUpdate:(SUAppcastItem *)item state:(SPUUserUpdateState *)state {
  self.updateVersion = item.displayVersionString ?: item.versionString;
  self.userChoice = choice == SPUUserUpdateChoiceInstall ? @"install" : choice == SPUUserUpdateChoiceSkip ? @"skip" : @"dismiss";
  self.updateStage = state.stage == SPUUserUpdateStageInstalling ? @"installing" : state.stage == SPUUserUpdateStageDownloaded ? @"downloaded" : @"not-downloaded";
  // Sparkle remembers skipped versions and excludes them from information
  // probes. Clear our badge so future probes can discover a newer version.
  if (choice == SPUUserUpdateChoiceSkip) {
    [self.gate invalidate]; self.updateVersion = nil; self.updateStage = nil;
    self.noUpdateReason = nil; self.lastError = nil; _downloadBegan = NO; _progress.reset(); self.phase = @"idle";
  } else if (choice == SPUUserUpdateChoiceDismiss && !self.gate.token) {
    self.phase = state.stage == SPUUserUpdateStageInstalling ? @"ready" : state.stage == SPUUserUpdateStageDownloaded ? @"downloaded" : @"available";
  }
  [self emit:@"state" extra:nil];
}
- (void)updater:(SPUUpdater *)updater willDownloadUpdate:(SUAppcastItem *)item withRequest:(NSMutableURLRequest *)request {
  _downloadBegan = NO; _progress.reset(); [self transition:@"downloading"];
}
- (void)updater:(SPUUpdater *)updater didDownloadUpdate:(SUAppcastItem *)item { self.updateStage = @"downloaded"; [self transition:@"downloaded"]; }
- (void)updater:(SPUUpdater *)updater failedToDownloadUpdate:(SUAppcastItem *)item error:(NSError *)error { [self recordError:error]; }
- (void)userDidCancelDownload:(SPUUpdater *)updater { [self.gate invalidate]; self.updateStage = @"not-downloaded"; [self transition:self.updateVersion ? @"available" : @"idle"]; }
- (void)updater:(SPUUpdater *)updater willExtractUpdate:(SUAppcastItem *)item { [self transition:@"extracting"]; }
- (void)updater:(SPUUpdater *)updater didExtractUpdate:(SUAppcastItem *)item { [self transition:@"ready"]; }
- (void)updater:(SPUUpdater *)updater willInstallUpdate:(SUAppcastItem *)item { self.updateStage = @"installing"; [self transition:@"ready"]; }
- (BOOL)updater:(SPUUpdater *)updater shouldPostponeRelaunchForUpdate:(SUAppcastItem *)item untilInvokingBlock:(void (^)(void))handler {
  NSString *token = [self.gate defer:handler]; self.phase = @"awaiting-relaunch";
  [self emit:@"prepare-relaunch" extra:@{@"token": token}];
  return YES;
}
- (void)updaterWillRelaunchApplication:(SPUUpdater *)updater { [self transition:@"installing"]; }
- (void)updater:(SPUUpdater *)updater didAbortWithError:(NSError *)error {
  if ([error.domain isEqualToString:SUSparkleErrorDomain] && error.code == SUNoUpdateError) return;
  if ([error.domain isEqualToString:SUSparkleErrorDomain] && error.code == SUInstallationCanceledError) { [self.gate invalidate]; self.updateStage = @"not-downloaded"; [self transition:self.updateVersion ? @"available" : @"idle"]; return; }
  [self recordError:error];
}
- (void)updater:(SPUUpdater *)updater didFinishUpdateCycleForUpdateCheck:(SPUUpdateCheck)check error:(NSError *)error {
  if (error) { [self updater:updater didAbortWithError:error]; return; }
  if (!self.gate.token && [self.phase isEqualToString:@"checking"]) [self transition:self.updateVersion ? @"available" : @"idle"];
  else [self emit:@"state" extra:nil];
}
- (void)dispose {
  if (self.observing) for (NSString *key in @[@"canCheckForUpdates", @"sessionInProgress", @"lastUpdateCheckDate"]) [self.updater removeObserver:self forKeyPath:key];
  self.observing = NO; [self.gate invalidate];
  if (self.events) { napi_release_threadsafe_function(self.events, napi_tsfn_abort); self.events = nullptr; }
  self.updater = nil; self.userDriver = nil;
}
@end

// Extend only public progress notifications. Every Sparkle window, decision,
// cancellation and installer interaction remains in the standard user driver.
@implementation SUProgressUserDriver
- (void)showDownloadInitiatedWithCancellation:(void (^)(void))cancellation {
  [super showDownloadInitiatedWithCancellation:cancellation]; [self.owner downloadBegan];
}
- (void)showDownloadDidReceiveExpectedContentLength:(uint64_t)length {
  [super showDownloadDidReceiveExpectedContentLength:length]; [self.owner downloadExpected:length];
}
- (void)showDownloadDidReceiveDataOfLength:(uint64_t)length {
  [super showDownloadDidReceiveDataOfLength:length]; [self.owner downloadReceived:length];
}
@end

static SUNodeUpdater *bridge;
static napi_value Fail(napi_env env, const char *message) { napi_throw_error(env, "ERR_SECOND_U_UPDATER", message); return nullptr; }
static bool MainThread(napi_env env) {
  if ([NSThread isMainThread]) return true;
  Fail(env, "The updater is only available on the Electron main thread."); return false;
}
static void Cleanup(void *) { if (bridge) { [bridge dispose]; bridge = nil; } }
static napi_value GetState(napi_env env, napi_callback_info info) {
  if (!MainThread(env)) return nullptr;
  return ToJS(env, bridge ? [bridge state] : @{@"engine": @"sparkle", @"engineVersion": @"2.9.6", @"started": @NO, @"phase": @"idle", @"canCheckForUpdates": @NO, @"canShow": @NO, @"sessionInProgress": @NO, @"awaitingRelaunch": @NO, @"automaticallyChecksForUpdates": @NO, @"automaticallyDownloadsUpdates": @NO});
}
static napi_value Start(napi_env env, napi_callback_info info) {
  if (!MainThread(env)) return nullptr;
  if (bridge) return ToJS(env, [bridge state]);
  if (!NSApp || ![NSApp isRunning]) return Fail(env, "Start the updater only after Electron app.whenReady() in a packaged macOS app.");
  NSBundle *bundle = [NSBundle mainBundle];
  NSString *feed = [bundle objectForInfoDictionaryKey:@"SUFeedURL"], *key = [bundle objectForInfoDictionaryKey:@"SUPublicEDKey"];
  NSURL *feedURL = [feed isKindOfClass:[NSString class]] ? [NSURL URLWithString:feed] : nil;
  NSData *publicKey = [key isKindOfClass:[NSString class]] ? [[NSData alloc] initWithBase64EncodedString:key options:0] : nil;
  if (![feedURL.scheme isEqualToString:@"https"] || !feedURL.host.length || feedURL.user || feedURL.password || publicKey.length != 32) return Fail(env, "The signed app bundle is missing its fixed HTTPS update feed or EdDSA public key.");
  size_t argc = 1; napi_value args[1], callback; napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_valuetype optionsType; if (!argc || napi_typeof(env, args[0], &optionsType) != napi_ok || optionsType != napi_object) return Fail(env, "start requires an onEvent callback.");
  bool has = false; napi_has_named_property(env, args[0], "onEvent", &has);
  if (!has || napi_get_named_property(env, args[0], "onEvent", &callback) != napi_ok) return Fail(env, "start requires an onEvent callback.");
  napi_valuetype type; napi_typeof(env, callback, &type); if (type != napi_function) return Fail(env, "onEvent must be a function.");
  bridge = [SUNodeUpdater new];
  napi_value resource; napi_create_string_utf8(env, "SecondU Sparkle events", NAPI_AUTO_LENGTH, &resource);
  napi_threadsafe_function events;
  if (napi_create_threadsafe_function(env, callback, nullptr, resource, 0, 1, nullptr, nullptr, nullptr, Deliver, &events) != napi_ok) { bridge = nil; return Fail(env, "Cannot create the updater callback."); }
  bridge.events = events;
  napi_unref_threadsafe_function(env, bridge.events);
  bridge.userDriver = [[SUProgressUserDriver alloc] initWithHostBundle:bundle delegate:nil];
  bridge.userDriver.owner = bridge;
  bridge.updater = [[SPUUpdater alloc] initWithHostBundle:bundle applicationBundle:bundle userDriver:bridge.userDriver delegate:bridge];
  SPUUpdater *updater = bridge.updater;
  updater.automaticallyChecksForUpdates = NO; updater.automaticallyDownloadsUpdates = NO;
  for (NSString *property in @[@"canCheckForUpdates", @"sessionInProgress", @"lastUpdateCheckDate"]) [updater addObserver:bridge forKeyPath:property options:0 context:nullptr];
  bridge.observing = YES;
  NSError *error = nil;
  if (![updater startUpdater:&error]) { [bridge recordError:error]; [bridge dispose]; bridge = nil; return Fail(env, error.localizedDescription.UTF8String ?: "Sparkle could not start."); }
  [bridge emit:@"state" extra:nil]; return ToJS(env, [bridge state]);
}
static napi_value Check(napi_env env, napi_callback_info info) {
  if (!MainThread(env)) return nullptr;
  if (!bridge) return Fail(env, "The updater has not been started.");
  if (!bridge.updater.canCheckForUpdates) return ToJS(env, [bridge state]);
  [bridge.updater checkForUpdates]; return ToJS(env, [bridge state]);
}
static napi_value CheckInBackground(napi_env env, napi_callback_info info) {
  if (!MainThread(env)) return nullptr;
  if (!bridge) return Fail(env, "The updater has not been started.");
  if (bridge.updater.canCheckForUpdates && !bridge.updater.sessionInProgress && !bridge.gate.token && [@[@"idle", @"up-to-date", @"no-update", @"error"] containsObject:bridge.phase]) [bridge.updater checkForUpdateInformation];
  return ToJS(env, [bridge state]);
}
static napi_value Resume(napi_env env, napi_callback_info info) {
  if (!MainThread(env)) return nullptr;
  size_t argc = 1; napi_value args[1]; napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  size_t length = 0; if (!bridge || !argc || napi_get_value_string_utf8(env, args[0], nullptr, 0, &length) != napi_ok || length > 128) return Fail(env, "Invalid relaunch token.");
  char token[129]; napi_get_value_string_utf8(env, args[0], token, sizeof(token), &length);
  if (![bridge.gate resume:[NSString stringWithUTF8String:token]]) return Fail(env, "The relaunch token is stale or already consumed.");
  return ToJS(env, [bridge state]);
}
static napi_value Show(napi_env env, napi_callback_info info) {
  if (!MainThread(env)) return nullptr;
  if (!bridge) return Fail(env, "The updater has not been started.");
  if (bridge.gate.token) [bridge emit:@"prepare-relaunch" extra:@{@"token": bridge.gate.token}];
  else if (bridge.updater.canCheckForUpdates) [bridge.updater checkForUpdates];
  return ToJS(env, [bridge state]);
}
static napi_value Init(napi_env env, napi_value exports) {
  if (!MainThread(env)) return nullptr;
  napi_property_descriptor api[] = {{"start", nullptr, Start, nullptr, nullptr, nullptr, napi_default, nullptr}, {"getState", nullptr, GetState, nullptr, nullptr, nullptr, napi_default, nullptr}, {"checkForUpdates", nullptr, Check, nullptr, nullptr, nullptr, napi_default, nullptr}, {"resumeRelaunch", nullptr, Resume, nullptr, nullptr, nullptr, napi_default, nullptr}};
  napi_define_properties(env, exports, 4, api);
  napi_property_descriptor show = {"show", nullptr, Show, nullptr, nullptr, nullptr, napi_default, nullptr};
  napi_define_properties(env, exports, 1, &show);
  napi_property_descriptor background = {"checkInBackground", nullptr, CheckInBackground, nullptr, nullptr, nullptr, napi_default, nullptr};
  napi_define_properties(env, exports, 1, &background); napi_add_env_cleanup_hook(env, Cleanup, nullptr); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
