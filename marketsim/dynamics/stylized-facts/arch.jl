using Optim, ForwardDiff

softplus(x) = log1p(exp(-abs(x))) + max(x, 0.0)  # stable softplus

function map_params(u::AbstractVector{<:Real})
    a0 = exp(u[1])               # > 0
    a  = softplus.(u[2:end])     # ≥ 0
    return a0, a
end

# Gaussian ARCH(q) log-likelihood
function loglik_q(y::AbstractVector{<:Real}, u::AbstractVector{<:Real}; param_map = map_params)
    T = length(y)
    q = length(u) - 1
    @assert T > q "T > q required for ARCH(q)"

    a0, a = param_map(u)
    @assert length(a) == q

    ll = 0.0
    log2π = log(2π)
    ϵ = 1e-12

    @inbounds for t in (q+1):T
        σ2 = a0
        @inbounds for i in 1:q
            σ2 += a[i] * (y[t-i]^2)
        end
        σ2 = max(σ2, ϵ)
        ll += -0.5 * (log2π + log(σ2) + (y[t]^2)/σ2)
    end
    return ll
end

function fit_arch_q(y::AbstractVector{<:Real}, q::Int; param_map = map_params)
    u0 = zeros(q + 1)                        # initial point in ℝ^{q+1}
    nll(u) = -loglik_q(y, u; param_map)      # objective for Optim

    res = optimize(nll, u0, LBFGS(); autodiff = :forward)
    û = Optim.minimizer(res)
    a0̂, â = param_map(û)
    return (a0 = a0̂, a = â, loglik = -Optim.minimum(res), result = res)
end

# ===== TEST =====
function test(n::Int, q::Int)
    y = randn(n)
    return fit_arch_q(y, q)
end

# println(test(1000, 10))