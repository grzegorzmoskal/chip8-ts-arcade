type Casted<T, S> = {[P in keyof T]: S }
type TMap<TValue> = { [key: number]: TValue }
type SMap<TValue> = { [key: string]: TValue }
type State = {
    sp: number,
    I: number,
    pc: number,
    V: number[],
    stack: number[],
    memory: Buffer,
    screen: Image,
    keys: any,
    delayTimer: number,
    soundTimer: number,
    isDrawing: boolean
}
// prettier-ignore

const chars = [
    0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
    0x20, 0x60, 0x20, 0x20, 0x70, // 1
    0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
    0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
    0x90, 0x90, 0xF0, 0x10, 0x10, // 4
    0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
    0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
    0xF0, 0x10, 0x20, 0x40, 0x40, // 7
    0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
    0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
    0xF0, 0x90, 0xF0, 0x90, 0x90, // A
    0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
    0xF0, 0x80, 0x80, 0x80, 0xF0, // C
    0xE0, 0x90, 0x90, 0x90, 0xE0, // D
    0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
    0xF0, 0x80, 0xF0, 0x80, 0x80, // F
]

const split = (s: string) => {
    const res: string[] = []
    for (let i = 0; i < s.length; i++)
        res.push(s[i])
    return res
}

const keys = split("1234qwerasdfzxcv")
const width = 64
const height = 32

namespace cpu {

    const getArray = (size: number): number[] => {
        let res: number[] = []
        for (let i = 0; i < size; i++)
            res.push(0)
        return res
    }
    const keysMap: any = {}
    for (let i = 0; i < 0; i++)
        keysMap[i] = false

    export const getInitialState = (): State => ({
        sp: 0,
        I: 0,
        pc: 0x200,
        V: getArray(16),
        stack: getArray(16),
        memory: control.createBuffer(0x1000),
        screen: image.create(width * 2, height * 2),
        keys: keysMap,
        delayTimer: 0,
        soundTimer: 0,
        isDrawing: false
    })

    export const loadProgram = (program: Buffer) => {
        for (let i = 0; i < program.length; i++)
            state.memory[i + 0x200] = program[i]
    }

    export let state: State;//ReturnType<typeof getInitialState>
    export const init = (delta: any) => {
        state = getInitialState()
        Object.keys(delta).forEach(key => (state as any)[key] = delta[key])
        for (let i = 0; i < chars.length; i++) state.memory[i] = chars[i]
    }

    type FOc = (oc: number) => number
    const X: FOc = oc => (oc & 0x0f00) >> 8
    const Vx: FOc = oc => state.V[X(oc)]
    const Y: FOc = oc => (oc & 0x00f0) >> 4
    const Vy: FOc = oc => state.V[Y(oc)]
    const N: FOc = oc => oc & 0x000f
    const NN: FOc = oc => oc & 0x00ff
    const NNN: FOc = oc => oc & 0x0fff

    // const plus = (a: any) => (typeof a === "number" ? a : a ? 1 : 0)

    type FCalcVf = (vx: number, vy: number) => boolean | number
    const setVf = (calcVf: FCalcVf) => (oc: number) => (state.V[0xf] = 0 + (calcVf(Vx(oc), Vy(oc)) as number))

    type FCalcVx = (vx: number, vy: number) => number
    const setVx = (calcVx: FCalcVx) => (oc: number) => {
        const x = X(oc)
        const v = calcVx(state.V[x], Vy(oc))
        state.V[x] = v + (v < 0 ? 256 : v > 255 ? -256 : 0)
    }

    const setVfVx = (calcVf: FCalcVf, calcVx: FCalcVx) => (oc: number) => {
        setVf(calcVf)(oc)
        setVx(calcVx)(oc)
    }

    const setI = (calcI: (vx: number, i: number) => number) => (oc: number) => (state.I = calcI(Vx(oc), state.I))
    const incPc = (cond: (vx: number, vy: number) => boolean) => (oc: number) => (state.pc += cond(Vx(oc), Vy(oc)) ? 2 : 0)
    const onVx = (cb: (vx: number) => void) => (oc: number) => cb(Vx(oc))

    const updatePixel = (x: number, y: number) => {
        x += x < 0 ? width : x > width ? -width : 0
        y += y < 0 ? height : y > height ? -height : 0
        x *= 2
        y *= 2
        let p = state.screen.getPixel(x, y)
        state.screen.setPixel(x, y, p ? 0 : 10)
        state.screen.setPixel(x + 1, y, p ? 0 : 10)
        state.screen.setPixel(x, y + 1, p ? 0 : 10)
        state.screen.setPixel(x + 1, y + 1, p ? 0 : 10)
        return p == 0 ? 0 : 1
    }

    const draw = (oc: number) => {
        const memory = state.memory
        const V = state.V
        const I = state.I
        const vx = Vx(oc)
        const vy = Vy(oc)
        const h = N(oc)
        V[0xf] = 0
        for (let y = 0; y < h; y++) {
            let pixel = memory[I + y]
            for (let x = 0; x < 8; x++) {
                if ((pixel & 0x80) > 0 && updatePixel(vx + x, vy + y)) V[0xf] = 1
                pixel <<= 1
            }
        }

        state.isDrawing = true
    }

    const setKey = (oc: number) => {
        let keyPress = false
        keys.forEach((_, i) => {
            if (state.keys[i]) {
                state.V[X(oc)] = i
                keyPress = true
            }
        })
        if (!keyPress) state.pc -= 2
    }

    export const runOpcode = (oc: number): ((oc: number) => void) | null => {
        switch (oc & 0xf000) {
            case 0x0000:
                switch (oc) {
                    case 0x00e0:
                        state.screen.fill(0)
                        break
                    case 0x00ee:
                        state.sp = state.sp - 1
                        state.pc = state.stack[state.sp]
                        break
                }
                return null
            case 0x1000:
                state.pc = NNN(oc)
                return null
            case 0x2000: // NNN(23e6) => 3e6
                state.stack[state.sp] = state.pc
                state.sp = state.sp + 1
                state.pc = NNN(oc)
                return null

            case 0x3000:
                return incPc(vx => vx === NN(oc))
            case 0x4000:
                return incPc(vx => vx !== NN(oc))
            case 0x5000:
                return incPc((vx, vy) => vx === vy)
            case 0x6000:
                return setVx(() => NN(oc))
            case 0x7000:
                return setVx(vx => vx + NN(oc))
            case 0x8000:
                switch (oc & 0x000f) {
                    case 0x0000:
                        return setVx((_, vy) => vy)
                    case 0x0001:
                        return setVx((vx, vy) => vx | vy)
                    case 0x0002:
                        return setVx((vx, vy) => vx & vy)
                    case 0x0003:
                        return setVx((vx, vy) => vx ^ vy)
                    case 0x0004:
                        return setVfVx((vx, vy) => vx + vy > 255, (vx, vy) => vx + vy)
                    case 0x0005:
                        return setVfVx((vx, vy) => vx > vy, (vx, vy) => vx - vy)
                    case 0x0006:
                        return setVfVx(vx => vx & 0x1, vx => vx >> 1)
                    case 0x0007:
                        return setVfVx((vx, vy) => vy > vx, (vx, vy) => vy - vx)
                    case 0x000e:
                        return setVfVx(vx => vx & 0xf0, vx => vx << 1)
                }
                break
            case 0x9000:
                return incPc((vx, vy) => vx !== vy)
            case 0xa000:
                return setI(() => NNN(oc))
            case 0xb000:
                state.pc = NNN(oc) + state.V[0]
                return null
            case 0xc000:
                return setVx(() => ~~(Math.random() * 0xff) & NN(oc))
            case 0xd000:
                return draw
            case 0xe000:
                switch (oc & 0x00ff) {
                    case 0x009e:
                        return incPc(vx => state.keys[vx])
                    case 0x00a1:
                        return incPc(vx => !state.keys[vx])
                }
                break
            case 0xf000:
                switch (oc & 0x00ff) {
                    case 0x0007:
                        return setVx(() => state.delayTimer)
                    case 0x000a:
                        return setKey
                    case 0x0015:
                        return onVx(vx => (state.delayTimer = vx))
                    case 0x0018:
                        return onVx(vx => (state.soundTimer = vx))
                    case 0x001e:
                        setVf(vx => state.I + vx > 0xfff)(oc) // Undocumented overflow feature for Spacefight 2091! game
                        return setI((vx, i) => vx + i)
                    case 0x0029:
                        return setI(vx => vx * 5)
                    case 0x0033:
                        return onVx(vx => {
                            const I = state.I
                            const memory = state.memory
                            memory[I + 2] = vx % 10
                            memory[I + 1] = ~~(vx / 10) % 10
                            memory[I] = ~~(vx / 100) % 10
                        })
                    case 0x0055:
                    case 0x0065: {
                        const x = X(oc)
                        const restore = (oc & 0x00ff) === 0x0065
                        const memory = state.memory
                        const V = state.V
                        const I = state.I
                        for (let i = 0; i <= x; i++) {
                            if (restore) V[i] = memory[I + i]
                            else memory[I + i] = V[i]
                        }
                        state.I += x + 1
                        return null
                    }
                }
        }
        // tslint:disable-next-line:no-console
        console.log(`invalid opcode: ${oc.toString()}!`)
        return null
    }

    export const runNextInstruction = () => run((state.memory[state.pc] << 8) | state.memory[state.pc + 1])
    export const run = (oc: number) => {
        console.log(`${oc.toString()}`)

        state.pc += 2
        const delta = runOpcode(oc)
        if (delta !== null) delta(oc)
    }
}