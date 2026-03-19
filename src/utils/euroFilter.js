// One Euro Filter implementation for smoothing landmark positions
// Based on the paper "One-Euro Filter: A Simple and Speedy Method to Smooth Signals"
// by G. Casiez, N. Roussel, and D. Vogel

export class OneEuroFilter {
    constructor(minCutoff = 1.0, beta = 0.0, cutoffSlope = 0.001) {
        this.minCutoff = minCutoff
        this.beta = beta
        this.cutoffSlope = cutoffSlope
        this.xPrev = null
        this.dxPrev = null
        this.tPrev = null
    }

    /**
     * Calculate dynamic cutoff frequency based on the rate of change
     */
    dynamicCutoff() {
        if (this.xPrev === null || this.tPrev === null) {
            return this.minCutoff
        }

        // Calculate the rate of change (derivative)
        const dt = this.tPrev > 0 ? (performance.now() - this.tPrev) / 1000 : 0.016
        if (dt <= 0) return this.minCutoff

        // Calculate cutoff based on rate of change
        const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev)
        return Math.max(0.001, cutoff) // Prevent zero or negative cutoff
    }

    /**
     * Filter a new value
     * @param {number} x - New value to filter
     * @param {number} t - Timestamp (optional, uses performance.now() if not provided)
     * @returns {number} - Filtered value
     */
    filter(x, t) {
        const currentTime = t || performance.now()
        
        // Calculate dynamic cutoff
        const cutoff = this.dynamicCutoff()
        const alpha = this.alpha(cutoff, currentTime)

        if (this.xPrev === null) {
            this.xPrev = x
            this.dxPrev = 0
            this.tPrev = currentTime
            return x
        }

        // Filter the value
        const xFiltered = alpha * x + (1 - alpha) * this.xPrev

        // Estimate derivative
        const dt = (currentTime - this.tPrev) / 1000 // Convert to seconds
        if (dt > 0) {
            this.dxPrev = (xFiltered - this.xPrev) / dt
        }

        this.xPrev = xFiltered
        this.tPrev = currentTime

        return xFiltered
    }

    /**
     * Calculate smoothing factor alpha from cutoff frequency
     */
    alpha(cutoff, currentTime) {
        const tau = 1.0 / (2 * Math.PI * cutoff)
        const dt = (currentTime - this.tPrev) / 1000 // Convert to seconds
        if (dt <= 0 || this.tPrev === null) return 1.0
        return dt / (tau + dt)
    }
}

// Helper function to create a 3D filter for vector smoothing
export class Vector3Filter {
    constructor(minCutoff = 1.0, beta = 0.0) {
        this.xFilter = new OneEuroFilter(minCutoff, beta)
        this.yFilter = new OneEuroFilter(minCutoff, beta)
        this.zFilter = new OneEuroFilter(minCutoff, beta)
    }

    filter(x, y, z, t) {
        return {
            x: this.xFilter.filter(x, t),
            y: this.yFilter.filter(y, t),
            z: this.zFilter.filter(z, t)
        }
    }
}