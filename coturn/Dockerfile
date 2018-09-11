FROM ubuntu:16.04

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    emacs-nox \
    build-essential \
    libssl-dev sqlite3 \
    libsqlite3-dev \
    libevent-dev \
    g++ \
    libboost-dev \
    libevent-dev \
    git


RUN git clone https://github.com/coturn/coturn.git
RUN cd coturn && \
    ./configure --prefix=/opt --bindir=/opt/bin64 --confdir=/opt/conf && \
    make && \
    make install

ENV PATH="/opt/bin64:${PATH}"
