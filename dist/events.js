import { EventEmitter } from "node:events";
export class UddEventBus {
    emitter = new EventEmitter();
    on(event, listener) {
        this.emitter.on(event, listener);
        return this;
    }
    off(event, listener) {
        this.emitter.off(event, listener);
        return this;
    }
    once(event, listener) {
        this.emitter.once(event, listener);
        return this;
    }
    emit(event, data) {
        return this.emitter.emit(event, data);
    }
    removeAllListeners(event) {
        this.emitter.removeAllListeners(event);
        return this;
    }
}
