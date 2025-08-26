using LinearAlgebra
using Statistics
using Plots
using FFTW
using Random

"""
    embed_timeseries(data::Vector{Float64}, m::Int, tau::Int) -> Matrix{Float64}

Create time-delay embedding of the input time series.

# Arguments
- `data::Vector{Float64}`: Input time series
- `m::Int`: Embedding dimension
- `tau::Int`: Time delay

# Returns
- `Matrix{Float64}`: Embedded vectors as rows (N×m matrix)
"""
function embed_timeseries(data::Vector{Float64}, m::Int, tau::Int)
    n = length(data)
    N = n - (m - 1) * tau
    
    if N <= 0
        error("Time series too short for given embedding parameters")
    end
    
    embedded = Matrix{Float64}(undef, N, m)
    
    for i in 1:N
        for j in 1:m
            embedded[i, j] = data[i + (j - 1) * tau]
        end
    end
    
    return embedded
end

"""
    estimate_time_delay(data::Vector{Float64}; max_tau::Int=50) -> Int

Estimate optimal time delay using autocorrelation function.

# Arguments
- `data::Vector{Float64}`: Input time series
- `max_tau::Int`: Maximum time delay to consider

# Returns
- `Int`: Estimated optimal time delay
"""
function estimate_time_delay(data::Vector{Float64}; max_tau::Int=50)
    n = length(data)
    autocorr = zeros(max_tau + 1)
    
    # Calculate autocorrelation
    data_centered = data .- mean(data)
    variance = var(data)
    
    for tau in 0:max_tau
        if tau >= n
            break
        end
        
        correlation = 0.0
        count = 0
        
        for i in 1:(n - tau)
            correlation += data_centered[i] * data_centered[i + tau]
            count += 1
        end
        
        autocorr[tau + 1] = correlation / (count * variance)
    end
    
    # Find first zero crossing or minimum
    for tau in 2:length(autocorr)
        if autocorr[tau] <= 0 || (tau > 2 && autocorr[tau] > autocorr[tau-1])
            return tau - 1
        end
    end
    
    # If no zero crossing found, return tau where autocorr drops to 1/e
    target = 1/ℯ
    for tau in 2:length(autocorr)
        if autocorr[tau] <= target
            return tau - 1
        end
    end
    
    return 10  # Default fallback
end

"""
    estimate_embedding_dimension(data::Vector{Float64}, tau::Int; max_dim::Int=10) -> Int

Estimate embedding dimension using false nearest neighbors method (simplified).

# Arguments
- `data::Vector{Float64}`: Input time series
- `tau::Int`: Time delay
- `max_dim::Int`: Maximum embedding dimension to test

# Returns
- `Int`: Estimated embedding dimension
"""
function estimate_embedding_dimension(data::Vector{Float64}, tau::Int; max_dim::Int=10)
    n = length(data)
    tolerance = 2.0  # Threshold for false nearest neighbors
    
    for m in 1:max_dim
        if n - (m + 1) * tau <= 10  # Not enough points
            return m
        end
        
        # Embed in dimension m and m+1
        embedded_m = embed_timeseries(data, m, tau)
        embedded_m1 = embed_timeseries(data, m + 1, tau)
        
        N_m = size(embedded_m, 1)
        N_m1 = size(embedded_m1, 1)
        
        false_neighbors = 0
        total_neighbors = 0
        
        for i in 1:min(N_m, N_m1, 1000)  # Limit for efficiency
            # Find nearest neighbor in m-dimensional space
            min_dist = Inf
            nearest_idx = 0
            
            for j in 1:N_m
                if i == j
                    continue
                end
                
                dist = norm(embedded_m[i, :] - embedded_m[j, :])
                if dist < min_dist
                    min_dist = dist
                    nearest_idx = j
                end
            end
            
            if nearest_idx > 0 && nearest_idx <= N_m1 && min_dist > 0
                # Check if still nearest neighbor in (m+1)-dimensional space
                dist_m1 = norm(embedded_m1[i, :] - embedded_m1[nearest_idx, :])
                
                # Check for false nearest neighbor
                if abs(embedded_m1[i, end] - embedded_m1[nearest_idx, end]) / min_dist > tolerance
                    false_neighbors += 1
                end
                
                total_neighbors += 1
            end
        end
        
        if total_neighbors > 0
            false_neighbor_ratio = false_neighbors / total_neighbors
            if false_neighbor_ratio < 0.01  # Less than 1% false neighbors
                return m
            end
        end
    end
    
    return max_dim  # Fallback
end

"""
    wolf_lyapunov_exponent(data::Vector{Float64}, m::Int, tau::Int; 
                          delta_max_fraction::Float64=0.1, 
                          max_evolution::Int=100,
                          theiler_window::Int=0) -> Float64

Calculate the largest Lyapunov exponent using Wolf algorithm.

# Arguments
- `data::Vector{Float64}`: Input time series
- `m::Int`: Embedding dimension
- `tau::Int`: Time delay
- `delta_max_fraction::Float64`: Maximum separation as fraction of attractor size
- `max_evolution::Int`: Maximum evolution steps
- `theiler_window::Int`: Minimum temporal separation (0 for auto-estimate)

# Returns
- `Float64`: Largest Lyapunov exponent
"""
function wolf_lyapunov_exponent(data::Vector{Float64}, m::Int, tau::Int; 
                               delta_max_fraction::Float64=0.1, 
                               max_evolution::Int=100,
                               theiler_window::Int=0)
    
    # Embed the time series
    embedded = embed_timeseries(data, m, tau)
    N = size(embedded, 1)
    
    if N < 100
        error("Not enough embedded points for reliable calculation")
    end
    
    # Estimate attractor size and set maximum separation
    attractor_dists = Float64[]
    for i in 1:min(1000, N)
        for j in (i+1):min(i+100, N)
            push!(attractor_dists, norm(embedded[i, :] - embedded[j, :]))
        end
    end
    
    delta_max = delta_max_fraction * quantile(attractor_dists, 0.95)
    
    # Set Theiler window (temporal decorrelation)
    if theiler_window == 0
        theiler_window = max(10, tau * m)
    end
    
    # Main algorithm
    lambda_sum = 0.0
    total_evolution_time = 0
    valid_pairs = 0
    
    println("Starting Wolf algorithm calculation...")
    println("Embedded points: $N")
    println("Delta max: $delta_max")
    println("Theiler window: $theiler_window")
    
    for i in 1:(N - theiler_window - max_evolution)
        if i % 1000 == 0
            println("Processing point $i/$N")
        end
        
        # Find nearest neighbor
        min_dist = Inf
        nearest_idx = 0
        
        for j in 1:N
            # Skip temporally correlated points
            if abs(i - j) <= theiler_window
                continue
            end
            
            dist = norm(embedded[i, :] - embedded[j, :])
            if dist < min_dist && dist > 1e-10  # Avoid identical points
                min_dist = dist
                nearest_idx = j
            end
        end
        
        if nearest_idx == 0 || min_dist >= delta_max
            continue
        end
        
        # Track evolution
        initial_separation = min_dist
        k = 0
        final_separation = initial_separation
        
        for step in 1:max_evolution
            i_next = i + step
            j_next = nearest_idx + step
            
            # Check bounds
            if i_next > N || j_next > N
                break
            end
            
            current_separation = norm(embedded[i_next, :] - embedded[j_next, :])
            
            if current_separation > delta_max
                k = step - 1
                break
            end
            
            final_separation = current_separation
            k = step
        end
        
        # Calculate local Lyapunov exponent
        if k > 0 && final_separation > 1e-10
            local_lambda = log(final_separation / initial_separation) / k
            lambda_sum += local_lambda * k
            total_evolution_time += k
            valid_pairs += 1
        end
    end
    
    println("Valid pairs found: $valid_pairs")
    
    if total_evolution_time > 0
        lyapunov_exponent = lambda_sum / total_evolution_time
        println("Largest Lyapunov exponent: $lyapunov_exponent")
        return lyapunov_exponent
    else
        println("Warning: No valid trajectory pairs found!")
        return NaN
    end
end

"""
    generate_lorenz_system(;T::Float64=100.0, dt::Float64=0.01, 
                          sigma::Float64=10.0, rho::Float64=28.0, beta::Float64=8.0/3.0) -> Vector{Float64}

Generate Lorenz system time series for testing.

# Arguments
- `T::Float64`: Total time
- `dt::Float64`: Time step
- `sigma::Float64`: Lorenz parameter σ
- `rho::Float64`: Lorenz parameter ρ  
- `beta::Float64`: Lorenz parameter β

# Returns
- `Vector{Float64}`: x-component time series
"""
function generate_lorenz_system(;T::Float64=100.0, dt::Float64=0.01, 
                               sigma::Float64=10.0, rho::Float64=28.0, beta::Float64=8.0/3.0)
    
    steps = Int(T / dt)
    
    # Initialize
    x, y, z = 1.0, 1.0, 1.0
    timeseries = Float64[]
    
    println("Generating Lorenz system...")
    println("Parameters: σ=$sigma, ρ=$rho, β=$beta")
    println("Time steps: $steps")
    
    for i in 1:steps
        # Lorenz equations (Euler integration)
        dx = sigma * (y - x)
        dy = x * (rho - z) - y
        dz = x * y - beta * z
        
        x += dx * dt
        y += dy * dt
        z += dz * dt
        
        push!(timeseries, x)
    end
    
    return timeseries
end

"""
    analyze_timeseries(data::Vector{Float64}; auto_params::Bool=true, 
                      m::Int=3, tau::Int=15) -> Dict{String, Any}

Complete analysis of time series for Lyapunov exponent calculation.

# Arguments
- `data::Vector{Float64}`: Input time series
- `auto_params::Bool`: Whether to auto-estimate embedding parameters
- `m::Int`: Embedding dimension (used if auto_params=false)
- `tau::Int`: Time delay (used if auto_params=false)

# Returns
- `Dict{String, Any}`: Analysis results
"""
function analyze_timeseries(data::Vector{Float64}; auto_params::Bool=true, 
                           m::Int=3, tau::Int=15)
    
    println("\n" * "="^50)
    println("TIME SERIES LYAPUNOV ANALYSIS")
    println("="^50)
    
    results = Dict{String, Any}()
    results["data_length"] = length(data)
    results["mean"] = mean(data)
    results["std"] = std(data)
    
    println("Data length: $(length(data))")
    println("Mean: $(round(mean(data), digits=4))")
    println("Std: $(round(std(data), digits=4))")
    
    if auto_params
        println("\nEstimating embedding parameters...")
        
        # Estimate time delay
        tau_est = estimate_time_delay(data)
        println("Estimated time delay: $tau_est")
        
        # Estimate embedding dimension
        m_est = estimate_embedding_dimension(data, tau_est)
        println("Estimated embedding dimension: $m_est")
        
        results["tau_estimated"] = tau_est
        results["m_estimated"] = m_est
        
        # Use estimated parameters
        m_use = m_est
        tau_use = tau_est
    else
        m_use = m
        tau_use = tau
        println("\nUsing provided parameters:")
        println("Embedding dimension: $m_use")
        println("Time delay: $tau_use")
    end
    
    results["m_used"] = m_use
    results["tau_used"] = tau_use
    
    # Calculate Lyapunov exponent
    println("\nCalculating Lyapunov exponent...")
    lyapunov = wolf_lyapunov_exponent(data, m_use, tau_use)
    
    results["lyapunov_exponent"] = lyapunov
    
    # Interpretation
    println("\n" * "-"^30)
    println("RESULTS")
    println("-"^30)
    println("Largest Lyapunov Exponent: $(round(lyapunov, digits=6))")
    
    if isnan(lyapunov)
        println("Result: CALCULATION FAILED")
    elseif lyapunov > 0.01
        println("Result: CHAOTIC BEHAVIOR (λ₁ > 0)")
    elseif lyapunov > -0.01
        println("Result: MARGINALLY STABLE (λ₁ ≈ 0)")
    else
        println("Result: PERIODIC/STABLE (λ₁ < 0)")
    end
    
    return results
end

# Main execution function
function main()
    println("Julia Lyapunov Exponent Calculator")
    println("==================================\n")
    
    # Example 1: Test with Lorenz system
    println("EXAMPLE 1: Lorenz System")
    lorenz_data = generate_lorenz_system(T=50.0, dt=0.01)
    
    # Remove transient behavior
    transient_remove = 1000
    if length(lorenz_data) > transient_remove
        lorenz_data = lorenz_data[(transient_remove+1):end]
    end
    
    lorenz_results = analyze_timeseries(lorenz_data, auto_params=true)
    
    println("\nExpected Lyapunov exponent for Lorenz system: ~0.9056")
    println("Calculated: $(round(lorenz_results["lyapunov_exponent"], digits=4))")
    
    # Example 2: Sine wave (should give negative Lyapunov exponent)
    println("\n" * "="^50)
    println("EXAMPLE 2: Sine Wave (Non-chaotic)")
    
    t = 0:0.1:50
    sine_data = sin.(2π * t) + 0.1 * randn(length(t))  # Add small noise
    
    sine_results = analyze_timeseries(sine_data, auto_params=true)
    
    # Create visualization if Plots is available
    try
        # Plot time series
        p1 = plot(lorenz_data[1:1000], title="Lorenz Time Series (first 1000 points)", 
                 xlabel="Time Step", ylabel="x(t)")
        
        p2 = plot(sine_data[1:200], title="Sine Wave Time Series", 
                 xlabel="Time Step", ylabel="sin(t)")
        
        combined_plot = plot(p1, p2, layout=(2,1), size=(800, 600))
        
        # Save plot
        savefig(combined_plot, "lyapunov_timeseries.png")
        println("\nPlots saved as 'lyapunov_timeseries.png'")
        
    catch e
        println("Could not create plots: $e")
    end
    
    return lorenz_results, sine_results
end

# Run the analysis
if abspath(PROGRAM_FILE) == @__FILE__
    lorenz_results, sine_results = main()
end