class Item<T> {
  prev?: Item<T>;

  next?: Item<T>;

  constructor(public key: any, public value: T) {
    this.key = key;
    this.value = value;
  }
}

export class LRU<T = any> {
  private _size = 0;

  private map = new Map();

  private oldest?: Item<T>;

  private newest?: Item<T>;

  constructor(private readonly limit: number) {
    // eslint-disable-next-line no-restricted-globals
    if (!limit || isNaN(limit)) limit = 1;
    this.limit = limit;
  }

  size(): number {
    return this._size;
  }

  set(key: any, value: T): void {
    let item = this.map.get(key);
    if (item) {
      item.value = value;
      this.used(item);
      return;
    }

    this.map.set(key, (item = new Item(key, value)));

    if (this.newest) {
      this.newest.next = item;
      item.prev = this.newest;
    } else {
      this.oldest = item;
    }

    this.newest = item;
    this._size++;
    if (this._size > this.limit) {
      this.shift();
    }
  }

  get(key: any): T | undefined {
    const item = this.map.get(key);
    if (!item) return;
    this.used(item);
    return item.value;
  }

  shift(): void {
    const item = this.oldest;
    if (item) {
      if (item.next) {
        this.oldest = this.oldest!.next;
        this.oldest!.prev = undefined;
      } else {
        this.oldest = undefined;
        this.newest = undefined;
      }
      item.next = item.prev = undefined;
      this.map.delete(item.key);
      this._size--;
    }
  }

  clear(): void {
    this.oldest = this.newest = undefined;
    this._size = 0;
    this.map.clear();
  }

  private used(item: Item<T>): void {
    if (item === this.newest) return;
    if (item.next) {
      if (item === this.oldest) {
        this.oldest = item.next;
      }
      item.next.prev = item.prev;
    }
    if (item.prev) {
      item.prev.next = item.next;
    }
    item.next = undefined;
    item.prev = this.newest;
    if (this.newest) {
      this.newest.next = item;
    }
    this.newest = item;
  }
}
