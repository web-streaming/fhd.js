import { NetLoader, ResponseType } from '../net';
import { MSE } from './mse';

export class Controller {
  private mse: MSE;

  private manifestLoader = new NetLoader<string>({ responseType: ResponseType.TEXT })

  constructor(private readonly media: HTMLMediaElement) {
    this.media = media;
    this.mse = new MSE(media);
  }

  async load(url: string) {
    const res = await this.manifestLoader.load(url);
    if (res) {
      const { data } = res;
      const manifestor = 1;
    }
  }
}
