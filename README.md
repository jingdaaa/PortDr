# PortDr
** Portfolio Analytics · Optimisation · Visualisation **

PortDr is a full-stack portfolio analytics platform designed to help users explore, simulate, and optimise investment portfolios using transparent, defensible quantitative methods. It combines a modern React frontend with a Python analytics backend to deliver clear insights into risk–return trade-offs.

## Key Features
### Portfolio Analysis
-> Computes expected returns, volatility, and correlations from historical price data
-> Visualises portfolio characteristics clearly for interpretation and write-ups
### Portfolio Optimisation
-> Monte Carlo simulation of portfolio weights
-> Efficient frontier construction
-> Max-Sharpe portfolio selection given a user-defined risk-free rate
### Visualisation & UX
-> Interactive charts and metric cards
-> UI built with React, TypeScript, and Tailwind CSS
-> Designed to be intuitive for both technical and non-technical users

## Methodology 
### Data
-> Uses historical adjusted close prices per asset
-> Data pipeline designed to be extendable to real-time sources
### Model
-> Monte Carlo sampling of portfolio weights
-> Annualised return and volatility estimation
-> Sharpe ratio optimisation
### Outputs
-> Efficient frontier plots
-> Optimal allocation breakdown
-> Correlation and allocation metrics ready for reports or research
-> All modelling choices are intentionally transparent to ensure interpretability and defensibility.

## Tech Stack
### Frontend
React + TypeScript
Vite
Tailwind CSS
Component-driven UI architecture
### Backend
Python
Flask
NumPy / Pandas

## Modular analytics and optimisation logic
### Design Philosophy
Clarity over complexity - results should be explainable
Modularity – analytics, optimisation, and UI are cleanly separated
Extensibility & Scalability – designed to grow into richer data sources and models

## Use Cases
Educational demonstrations of modern portfolio theory
Research prototyping and experimentation
Scaling into more complex models for better invesment recommendations

## Disclaimer
** PortDr is provided for educational and research purpose only **
It should not be used as the sole basis for investment decisions

** Author **
Jingda Teh
Developer & Creator of PortDr
