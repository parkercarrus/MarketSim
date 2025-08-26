module DynamicsLab

using LinearAlgebra
using Statistics
using Random

export ODESystem, MapSystem,
       rk4!, integrate_ode, integrate_map,
       numerical_jacobian, newton_fixedpoint, classify_fixedpoint,
       lyapunov_spectrum_flow, lyapunov_spectrum_map, lyapunov_rosenstein,
       poincare_section,
       logistic_map, henon_map, duffing, van_der_pol, lorenz, rossler,
       bifurcation_logistic,
       correlation_sum, correlation_dimension, sample_entropy, approximate_entropy,
       boxcount_dimension,
       analyze_all

# ------------------------------------------------------------
# Utilities
# ------------------------------------------------------------

"""
    numerical_jacobian(f, x; eps=1e-6)

Finite-difference Jacobian of `f(x)::AbstractVector` at `x`.
Returns a Matrix size (length(x), length(x)).
"""
function numerical_jacobian(f, x::AbstractVector; eps::Float64=1e-6)
    n = length(x)
    fx = f(x)
    J = Matrix{Float64}(undef, n, n)
    @inbounds for j in 1:n
        x2 = copy(x)
        δ = eps * max(1.0, abs(x[j]))
        x2[j] += δ
        f2 = f(x2)
        for i in 1:n
            J[i,j] = (f2[i] - fx[i]) / δ
        end
        
        end
    end
    return J
end

"""
    rk4!(f, u, t, dt)

One RK4 step for ODE u' = f(u,t). Mutates and returns `u`.
"""
function rk4!(f, u::AbstractVector, t::Float64, dt::Float64)
    k1 = f(u, t)
    u2 = @. u + 0.5*dt*k1
    k2 = f(u2, t + 0.5*dt)
    u3 = @. u + 0.5*dt*k2
    k3 = f(u3, t + 0.5*dt)
    u4 = @. u + dt*k3
    k4 = f(u4, t + dt)
    @. u = u + (dt/6.0)*(k1 + 2k2 + 2k3 + k4)
    return u
end

# ------------------------------------------------------------
# Systems
# ------------------------------------------------------------

"""
Encapsulate an ODE system.
- `f(u,t) -> du/dt`
- `J(u,t) -> Jacobian matrix` or `nothing` (will use numerical_jacobian)
"""
struct ODESystem{F,J}
    f::F
    J::J
    dim::Int
end

"""
Encapsulate a discrete-time map.
- `f(x) -> next x`
- `J(x) -> Jacobian` or `nothing` (will use numerical_jacobian)
"""
struct MapSystem{F,J}
    f::F
    J::J
    dim::Int
end

# ------------------------------------------------------------
# Canonical examples
# ------------------------------------------------------------

"Logistic map: x_{n+1} = r x_n (1 - x_n)"
logistic_map(r) = (x->(r*x*(1-x)), x->reshape((r - 2r*x),1,1))

"Henon map with parameters a,b. Returns (f, J)."
function henon_map(a=1.4, b=0.3)
    f = x -> begin
        @assert length(x)==2
        x1, x2 = x
        [1 - a*x1^2 + x2, b*x1]
    end
    J = x -> begin
        x1, x2 = x
        [-2a*x1  1.0;
          b      0.0]
    end
    return (f, J)
end

"Lorenz system with parameters σ,ρ,β"
function lorenz(σ=10.0, ρ=28.0, β=8/3)
    f = (u,t)-> begin
        x,y,z = u
        [(σ*(y - x)),
         (x*(ρ - z) - y),
         (x*y - β*z)]
    end
    J = (u,t)-> begin
        x,y,z = u
        [ -σ   σ    0;
          ρ - z  -1   -x;
            y    x   -β]
    end
    return (f, J)
end

"Rössler system with parameters a,b,c"
function rossler(a=0.2, b=0.2, c=5.7)
    f = (u,t)-> begin
        x,y,z = u
        [-(y+z),
          x + a*y,
          b + z*(x - c)]
    end
    J = (u,t)-> begin
        x,y,z = u
        [ 0   -1   -1;
          1    a    0;
          z    0   (x - c)]
    end
    return (f, J)
end

"Duffing oscillator: x'' + δ x' + αx + βx^3 = γ cos(ω t)"
function duffing(α=-1.0, β=1.0, δ=0.2, γ=0.3, ω=1.2)
    f = (u,t)-> begin
        x, v = u
        [v, -δ*v - α*x - β*x^3 + γ*cos(ω*t)]
    end
    # Jacobian w.r.t u only (t treated as param)
    J = (u,t)-> begin
        x, v = u
        [ 0.0  1.0;
         (-α - 3β*x^2)  -δ]
    end
    return (f, J)
end

"Van der Pol oscillator: x'' - μ(1 - x^2)x' + x = 0"
function van_der_pol(μ=5.0)
    f = (u,t)-> begin
        x, v = u
        [v, μ*(1 - x^2)*v - x]
    end
    J = (u,t)-> begin
        x, v = u
        [0.0  1.0;
         (-2μ*x*v - 1.0)  (μ*(1 - x^2))]
    end
    return (f, J)
end

# ------------------------------------------------------------
# Integrators / Simulators
# ------------------------------------------------------------

"""
    integrate_ode(sys::ODESystem, u0, tspan, dt; discard=0)

Integrate ODE system with RK4. Returns (ts, traj::Matrix) with each column a state.
"""
function integrate_ode(sys::ODESystem, u0::AbstractVector, tspan::Tuple{Real,Real}, dt::Real; discard::Int=0)
    f = sys.f
    t0, t1 = float(tspan[1]), float(tspan[2])
    nsteps = Int(floor((t1 - t0)/dt))
    dim = sys.dim
    u = copy(float.(u0))
    ts = Vector{Float64}(undef, nsteps+1)
    X = Matrix{Float64}(undef, dim, nsteps+1)
    t = t0
    X[:,1] = u
    ts[1] = t
    for k in 1:nsteps
        rk4!(f, u, t, dt)
        t += dt
        X[:,k+1] = u
        ts[k+1] = t
    end
    if discard > 0
        return (ts[(discard+1):end], X[:, (discard+1):end])
    else
        return (ts, X)
    end
end

"""
    integrate_map(sys::MapSystem, x0, nsteps; discard=0)

Iterate map `x_{k+1} = f(x_k)`. Returns trajectory matrix with each column a state.
"""
function integrate_map(sys::MapSystem, x0::AbstractVector, nsteps::Int; discard::Int=0)
    f = sys.f
    dim = sys.dim
    X = Matrix{Float64}(undef, dim, nsteps+1)
    x = copy(float.(x0))
    X[:,1] = x
    for k in 1:nsteps
        x = f(x)
        X[:,k+1] = x
    end
    if discard > 0
        return X[:, (discard+1):end]
    else
        return X
    end
end

# ------------------------------------------------------------
# Fixed points and stability
# ------------------------------------------------------------

"""
    newton_fixedpoint(f, J, x0; tol=1e-10, maxiter=100, verbose=false)

Find fixed point x* s.t. f(x*) = x* using Newton's method on g(x)=f(x)-x.
If `J === nothing`, uses numerical Jacobian.
Returns (x*, converged, iters).
"""
function newton_fixedpoint(f, J, x0; tol=1e-10, maxiter=100, verbose=false)
    x = copy(float.(x0))
    for it in 1:maxiter
        fx = f(x)
        g = fx .- x
        ng = maximum(abs, g)
        if verbose
            @info "Newton iter=$it, residual=$ng"
        end
        if ng < tol
            return (x, true, it)
        end
        if J === nothing
            Jx = numerical_jacobian(f, x)
        else
            Jx = J(x)
        end
        # For fixed point of map, Jacobian of g is (Jf - I)
        G = Jx .- I
        dx = G \ g
        x .-= dx
    end
    return (x, false, maxiter)
end

"""
    classify_fixedpoint(Jx)

Classify fixed point using eigenvalues of Jacobian for flows (Re(λ)).
For maps, interpret eigenvalues directly (|λ|).
Returns a Dict with :eigs and :type (string).
"""
function classify_fixedpoint(Jx::AbstractMatrix; flow::Bool=true)
    λ = eigvals(Jx)
    kind::String
    if flow
        re = real.(λ)
        im = imag.(λ)
        if all(re .< 0) && all(isapprox.(im,0.0; atol=1e-12))
            kind = "stable node"
        elseif all(re .> 0) && all(isapprox.(im,0.0; atol=1e-12))
            kind = "unstable node"
        elseif any(re .< 0) && any(re .> 0)
            kind = "saddle"
        elseif all(re .< 0)
            kind = "stable focus"
        elseif all(re .> 0)
            kind = "unstable focus"
        else
            kind = "center / marginal"
        end
    else
        mag = abs.(λ)
        if all(mag .< 1)
            kind = "attractor (map)"
        elseif all(mag .> 1)
            kind = "repellor (map)"
        elseif any(mag .< 1) && any(mag .> 1)
            kind = "saddle (map)"
        else
            kind = "neutral (map)"
        end
    end
    return Dict(:eigs => λ, :type => kind)
end

# ------------------------------------------------------------
# Lyapunov exponents
# ------------------------------------------------------------

"""
    lyapunov_spectrum_map(f, J, x0, nsteps; transient=100, reorth=1)

Lyapunov spectrum for a map using QR method (Benettin). If `J === nothing`,
numerical Jacobian is used each step. Returns vector of λ sorted desc.
"""
function lyapunov_spectrum_map(f, J, x0::AbstractVector, nsteps::Int; transient::Int=100, reorth::Int=1)
    x = copy(float.(x0))
    d = length(x)
    Q = Matrix{Float64}(I, d, d)
    le = zeros(Float64, d)
    # burn-in
    for _ in 1:transient
        x = f(x)
    end
    # accumulate
    for k in 1:nsteps
        # propagate tangent
        Jx = (J === nothing) ? numerical_jacobian(f, x) : J(x)
        Z = Jx * Q
        # QR re-orthonormalization
        F = qr(Z)
        Q = Matrix(F.Q)
        R = UpperTriangular(F.R)
        # accumulate log norms
        @inbounds for i in 1:d
            le[i] += log(abs(R[i,i]) + eps())  # avoid log(0)
        end
        x = f(x)
        if reorth > 1 && (k % reorth == 0)
            # (already QR each step; optional noop)
        end
    end
    return sort(le ./ nsteps, rev=true)
end

"""
    lyapunov_spectrum_flow(f, J, u0, tmax, dt; transient=0.0, reorth_steps=10)

Lyapunov spectrum for continuous-time system via discrete QR every `reorth_steps`.
Uses RK4 for state; tangent is propagated with local linearization (Euler step per dt).
Returns exponents divided by total time.
"""
function lyapunov_spectrum_flow(f, J, u0::AbstractVector, tmax::Real, dt::Real;
                                transient::Real=0.0, reorth_steps::Int=10)
    u = copy(float.(u0))
    d = length(u)
    # burn-in
    if transient > 0
        ntrans = Int(floor(transient/dt))
        t = 0.0
        for _ in 1:ntrans
            rk4!(f, u, t, dt); t += dt
        end
    end
    Q = Matrix{Float64}(I, d, d)
    le = zeros(Float64, d)
    nsteps = Int(floor(tmax/dt))
    t = 0.0
    cnt = 0
    for _ in 1:nsteps
        # advance state
        rk4!(f, u, t, dt); t += dt
        # propagate tangent approximately: D ← (I + J(u)*dt) * D
        Ju = (J === nothing) ? numerical_jacobian(v->f(v,t), u) : J(u,t)
        Z = (I + dt*Ju) * Q
        cnt += 1
        if cnt % reorth_steps == 0
            F = qr(Z)
            Q = Matrix(F.Q)
            R = UpperTriangular(F.R)
            @inbounds for i in 1:d
                le[i] += log(abs(R[i,i]) + eps())
            end
            Z = Q # reset
        else
            Q = Z
        end
    end
    T = tmax
    return sort(le ./ (T), rev=true)
end

"""
    lyapunov_rosenstein(x; m=2, τ=1, W=10, k=1, maxiter=100)

Largest Lyapunov exponent from a scalar time series `x` using Rosenstein’s method
with delay embedding dimension `m` and delay `τ`. Theiler window `W` avoids
temporal neighbors. Returns (λ, iters_used).
"""
function lyapunov_rosenstein(x::AbstractVector{<:Real}; m::Int=2, τ::Int=1, W::Int=10, k::Int=1, maxiter::Int=100)
    N = length(x)
    M = N - (m-1)*τ
    @assert M > maxiter + 1 "time series too short for given m, τ"
    # build embedding
    X = Matrix{Float64}(undef, m, M)
    @inbounds for i in 1:M
        for j in 1:m
            X[j,i] = x[i + (j-1)*τ]
        end
    end
    # nearest neighbors excluding Theiler window
    function nn(i)
        best = -1
        bestd = Inf
        xi = view(X, :, i)
        for j in 1:M
            if abs(i - j) <= W; continue; end
            d = norm(@view X[:,j] .- xi)
            if d < bestd
                best = j; bestd = d
            end
        end
        return best
    end
    # divergence curve
    L = min(maxiter, M-maximum(collect(1:M)) )
    sums = zeros(Float64, maxiter)
    counts = zeros(Int, maxiter)
    for i in 1:(M-maxiter)
        j = nn(i)
        if j < 0; continue; end
        for kstep in 0:(maxiter-1)
            di = norm(@view X[:, i+kstep] .- X[:, j+kstep])
            if di > 0
                sums[kstep+1] += log(di)
                counts[kstep+1] += 1
            end
        end
    end
    valid = findall(>(0), counts)
    if isempty(valid)
        return (NaN, 0)
    end
    y = sums[valid] ./ counts[valid]
    # linear fit over early region
    # choose first 1/3 or at least 5 points
    mpts = max(5, Int(floor(length(y)/3)))
    xs = collect(0:(length(valid)-1))[1:mpts]
    ys = y[1:mpts]
    # simple least squares slope
    Xd = [ones(length(xs)) xs]
    β = Xd \ ys
    λ = β[2] # per step
    return (λ, mpts)
end

# ------------------------------------------------------------
# Poincaré sections
# ------------------------------------------------------------

"""
    poincare_section(ts, X, n, p0; direction=+1)

Collect Poincaré section points for trajectory X(t) crossing the plane
`dot(n, x - p0) = 0` with given direction (+1 up, -1 down, 0 both).
Returns matrix of crossing points (columns).
"""
function poincare_section(ts::AbstractVector, X::AbstractMatrix, n::AbstractVector, p0::AbstractVector; direction::Int=+1)
    d = length(n)
    @assert size(X,1) == d
    n = n ./ norm(n)
    sgn = t -> sign(dot(n, t .- p0))
    pts = Vector{Vector{Float64}}()
    for k in 1:(size(X,2)-1)
        s1 = sgn(@view X[:,k]); s2 = sgn(@view X[:,k+1])
        if s1 == 0; continue; end
        if s1 != s2
            # linear interpolation along segment
            x1 = @view X[:,k]; x2 = @view X[:,k+1]
            v = x2 .- x1
            α = -dot(n, x1 .- p0) / (dot(n, v) + eps())
            if 0.0 ≤ α ≤ 1.0
                xcross = x1 .+ α .* v
                # direction check
                if direction == 0 || sign(dot(n, v)) == direction
                    push!(pts, collect(xcross))
                end
            end
        end
    end
    if isempty(pts)
        return zeros(Float64, d, 0)
    else
        return reduce(hcat, pts)
    end
end

# ------------------------------------------------------------
# Bifurcation data (logistic)
# ------------------------------------------------------------

"""
    bifurcation_logistic(rmin, rmax; nr=1000, x0=0.5, transient=500, keep=200)

Generate (r, x) pairs for a logistic map bifurcation diagram.
"""
function bifurcation_logistic(rmin::Real, rmax::Real; nr::Int=1000, x0::Real=0.5, transient::Int=500, keep::Int=200)
    rs = range(rmin, rmax; length=nr)
    out_r = Float64[]
    out_x = Float64[]
    x = float(x0)
    for r in rs
        f = logistic_map(r)
        x = x0
        # burn-in
        for _ in 1:transient
            x = f(x)
        end
        # collect
        for _ in 1:keep
            x = f(x)
            push!(out_r, r)
            push!(out_x, x)
        end
    end
    return (out_r, out_x)
end

# ------------------------------------------------------------
# Nonlinear time series: correlation dimension, entropy, box-counting
# ------------------------------------------------------------

"""
    correlation_sum(X, r)

Given points as columns of X (dim × N), compute C(r) = 2/(N(N-1)) * #{i<j : ||xi-xj|| < r}.
Naive O(N^2).
"""
function correlation_sum(X::AbstractMatrix, r::Real)
    N = size(X,2)
    cnt = 0
    for i in 1:N-1
        xi = @view X[:,i]
        for j in (i+1):N
            xj = @view X[:,j]
            if norm(xi .- xj) < r
                cnt += 1
            end
        end
    end
    return (2.0 * cnt) / (N*(N-1))
end

"""
    correlation_dimension(X; rgrid=range(1e-3,1.0,length=20))

Estimate slope of log C(r) vs log r over middle scales.
Returns (D, rgrid, Cvals).
"""
function correlation_dimension(X::AbstractMatrix; rgrid=range(1e-2, 1.0, length=20))
    Cvals = [correlation_sum(X, r) for r in rgrid]
    y = log.(Cvals .+ eps())
    x = log.(collect(rgrid))
    # linear fit over central half
    n = length(x)
    lo = Int(floor(n*0.25)); hi = Int(ceil(n*0.75))
    lo = max(lo,1); hi = min(hi,n)
    Xd = [ones(hi-lo+1) x[lo:hi]]
    β = Xd \ y[lo:hi]
    D = β[2]
    return (D, rgrid, Cvals)
end

"""
    sample_entropy(x; m=2, r=0.2*std(x))

Compute Sample Entropy (SampEn) of scalar series x.
"""
function sample_entropy(x::AbstractVector{<:Real}; m::Int=2, r::Real=0.2*std(x))
    N = length(x)
    function count_matches(m)
        cnt = 0
        for i in 1:(N-m)
            xi = @view x[i:(i+m-1)]
            for j in (i+1):(N-m+1)
                xj = @view x[j:(j+m-1)]
                if maximum(abs.(xi .- xj)) ≤ r
                    cnt += 1
                end
            end
        end
        return cnt
    end
    A = count_matches(m+1)
    B = count_matches(m)
    if A == 0 || B == 0
        return Inf
    end
    return -log(A / B)
end

"""
    approximate_entropy(x; m=2, r=0.2*std(x))

Approximate Entropy (ApEn) for scalar series x.
"""
function approximate_entropy(x::AbstractVector{<:Real}; m::Int=2, r::Real=0.2*std(x))
    N = length(x)
    function ϕ(m)
        Cm = zeros(Float64, N-m+1)
        for i in 1:(N-m+1)
            xi = @view x[i:(i+m-1)]
            cnt = 0
            for j in 1:(N-m+1)
                xj = @view x[j:(j+m-1)]
                if maximum(abs.(xi .- xj)) ≤ r
                    cnt += 1
                end
            end
            Cm[i] = cnt / (N-m+1)
        end
        return mean(log.(Cm .+ eps()))
    end
    return ϕ(m) - ϕ(m+1)
end