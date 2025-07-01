import matplotlib.pyplot as plt
import pandas as pd
import time

plt.ion()
manager = plt.get_current_fig_manager()
manager.full_screen_toggle()  # make the plot fullscreen

fig, (ax1, ax2, ax3, ax4) = plt.subplots(4, 1, figsize=(18, 12), sharex=True)

while True:
    try:
        # Load data
        df = pd.read_csv('../results/price.csv', names=[
            'timestep', 'price', 'mean_reverter_volume', 'momentum_trader_volume', 'monkey_volume'
        ], header=0)

        count_df = pd.read_csv('../results/trader_counts.csv', names=[
            'timestep', 'monkeys', 'meanreverters', 'momentumtraders'
        ], header=0)

        latest_price = df['price'].iloc[-1]

        # --- Plot 1: Market Price ---
        ax1.clear()
        ax1.plot(df['timestep'], df['price'], color='blue')
        ax1.set_ylabel("Price")
        ax1.set_yscale('log')
        ax1.set_title(f"Market Price: {latest_price:.2f}")

        # --- Plot 2: Total Volume ---
        ax2.clear()
        total_volume = (
            df['mean_reverter_volume'] +
            df['momentum_trader_volume'] +
            df['monkey_volume']
        )
        ax2.plot(df['timestep'], total_volume, color='orange')
        ax2.set_ylabel("Total Volume")
        ax2.set_title("Total Trade Volume")

        # --- Plot 3: Volume by Trader Type ---
        ax3.clear()
        ax3.plot(df['timestep'], df['mean_reverter_volume'], label='MeanReverter')
        ax3.plot(df['timestep'], df['momentum_trader_volume'], label='MomentumTrader')
        ax3.plot(df['timestep'], df['monkey_volume'], label='Monkey')
        ax3.set_ylabel("Volume")
        ax3.set_title("Volume by Trader Type")
        ax3.legend()

        # --- Plot 4: Trader Counts ---
        ax4.clear()
        ax4.plot(count_df['timestep'], count_df['monkeys'], label='Monkeys')
        ax4.plot(count_df['timestep'], count_df['meanreverters'], label='MeanReverters')
        ax4.plot(count_df['timestep'], count_df['momentumtraders'], label='MomentumTraders')
        ax4.set_xlabel("Time")
        ax4.set_ylabel("Count")
        ax4.set_title("Trader Counts by Type")
        ax4.legend()

        fig.tight_layout()
        fig.canvas.draw()
        fig.canvas.flush_events()

    except Exception as e:
        print(f"Error: {e}")
        time.sleep(0.5)
