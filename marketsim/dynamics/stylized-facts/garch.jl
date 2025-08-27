using Optim, ForwardDiff

softplus(x) = log1p(exp(-abs(x))) + max(x, 0.0)

function map_params(θ::AbstractVector{<:Real}, q::Int)
    @assert length(θ) == 1 + 2*q
    ω = exp(θ[1])
    α = softplus.(θ[2 : 1+q])
    β = softplus.(θ[2+q : 1+2*q])
    return ω, α, β
end

function loglik_garch(y::AbstractVector{<:Real}, θ::AbstractVector{<:Real}, q::Int; param_map = map_params)
    T = length(y)
    @assert T > q "Need T > q for GARCH(q,q)"
    ω, α, β = param_map(θ, q)

    # stationarity guard
    s = sum(α) + sum(β)
    if s >= 1 - 1e-5
        return -Inf
    end

    # seed σ² with unconditional variance
    σ2 = similar(y, Float64)
    denom = max(1.0 - s, 1e-8)
    σ2_init = max(ω / denom, 1e-12)
    @inbounds for t in 1:q
        σ2[t] = σ2_init
    end

    # recursion
    @inbounds for t in (q+1):T
        s2 = ω
        @inbounds for i in 1:q
            s2 += α[i] * (y[t-i]^2) + β[i] * σ2[t-i]
        end
        σ2[t] = max(s2, 1e-12)
    end

    # Gaussian log-likelihood
    log2π = log(2π)
    ll = 0.0
    @inbounds for t in (q+1):T
        ll += -0.5 * (log2π + log(σ2[t]) + (y[t]^2)/σ2[t])
    end
    return ll
end

function fit_garch_q(y::AbstractVector{<:Real}, q::Int)
    θ0 = zeros(1 + 2*q)
    nll(θ) = -loglik_garch(y, θ, q)
    res = optimize(nll, θ0, LBFGS(); autodiff = :forward)
    θ̂ = Optim.minimizer(res)
    ω̂, α̂, β̂ = map_params(θ̂, q)
    return (ω = ω̂, α = α̂, β = β̂, loglik = -Optim.minimum(res), result = res)
end

# ===== TEST =====
function test(n::Int, q::Int)
    y = randn(n)
    return fit_garch_q(y, q)
end

println(test(1000, 10))
