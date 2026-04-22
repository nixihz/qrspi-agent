from setuptools import setup, find_packages

setup(
    name="qrspi-agent",
    version="1.0.0",
    description="QRSPI Agent - 结构化编程 Agent 工作流框架",
    long_description=open("README.md", encoding="utf-8").read(),
    long_description_content_type="text/markdown",
    author="Based on Dex Horthy's CRISPY Framework",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        # 核心依赖极少 - 框架本身不绑定特定 LLM
    ],
    extras_require={
        "dev": ["pytest", "black", "mypy"],
    },
    entry_points={
        "console_scripts": [
            "qrspi=qrspi.cli:main",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Tools",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
)
