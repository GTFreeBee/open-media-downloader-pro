/*global expect */

function ensureMock(received, matcherName) {
    if(received == null || received.mock == null || !Array.isArray(received.mock.calls)) {
        throw new TypeError(`${matcherName} can only be used on Jest mock functions`);
    }
}

expect.extend({
    toBeCalled(received) {
        ensureMock(received, "toBeCalled");
        const pass = received.mock.calls.length > 0;
        return {
            pass,
            message: () => `expected mock function ${pass ? "not " : ""}to be called`
        };
    },
    toBeCalledTimes(received, expected) {
        ensureMock(received, "toBeCalledTimes");
        const actual = received.mock.calls.length;
        const pass = actual === expected;
        return {
            pass,
            message: () => `expected mock function ${pass ? "not " : ""}to be called ${expected} times, but it was called ${actual} times`
        };
    },
    toBeCalledWith(received, ...expectedArgs) {
        ensureMock(received, "toBeCalledWith");
        const pass = received.mock.calls.some(call => this.equals(call, expectedArgs));
        return {
            pass,
            message: () => `expected mock function ${pass ? "not " : ""}to be called with ${this.utils.printExpected(expectedArgs)}`
        };
    }
});
