export const DESKTOP_VIEW_REGISTER = "pi-gui:desktop-view:register";
export const DESKTOP_VIEW_DISCOVER = "pi-gui:desktop-view:discover";
export const DESKTOP_VIEW_UNREGISTER = "pi-gui:desktop-view:unregister";
/** Registers and replays the same declaration without re-running its backend factory. */
export function registerDesktopView(pi, declaration) {
    if (!/^[a-z][a-z0-9._-]{0,63}$/.test(declaration.id)) {
        throw new TypeError("Desktop view ID must be a lowercase identifier of at most 64 characters");
    }
    if (!declaration.title.trim() || declaration.title.length > 120) {
        throw new TypeError("Desktop view title must contain 1 to 120 characters");
    }
    let available = false;
    let disposed = false;
    const publish = () => {
        if (disposed)
            return;
        pi.events.emit(DESKTOP_VIEW_REGISTER, {
            declaration,
            accept: () => {
                if (!disposed)
                    available = true;
            },
        });
    };
    const stopDiscovery = pi.events.on(DESKTOP_VIEW_DISCOVER, publish);
    const registration = {
        get available() {
            return available;
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            available = false;
            stopDiscovery();
            pi.events.emit(DESKTOP_VIEW_UNREGISTER, declaration);
        },
    };
    pi.on("session_shutdown", () => registration.dispose());
    publish();
    return registration;
}
//# sourceMappingURL=index.js.map