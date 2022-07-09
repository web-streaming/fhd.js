import { NetLoader, ResponseType } from '../net';

export class PresentationTimeline {
  public availabilityStartTime = 0;

  private timeSyncUrl?: string;

  private timeSyncMethod = 'GET';

  private timeSyncSchemeIdUri?: string;

  private syncLoader?: NetLoader<string>;

  private clientTimeOffset = 0;

  timeSync() {
    if (!this.syncLoader) this.syncLoader = new NetLoader<string>({ responseType: ResponseType.TEXT });
  }

  setTimeOffsetFromUTC(time: number) {
    if (time) {
      this.clientTimeOffset = Date.now() - time;
    }
  }

  setTimeSyncRequest(url: string, method: 'GET' | 'HEAD') {
    if (url) this.timeSyncUrl = url;
    if (method) this.timeSyncMethod = url;
  }

  tryTimeSync() {

  }
}
