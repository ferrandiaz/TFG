FROM mhart/alpine-node:8.9.0


ENV HOME /app
WORKDIR $HOME

COPY package.json ${HOME}/
COPY src/ ${HOME}/src
COPY entrypoint.sh /

RUN apk add --update git && \
  rm -rf /tmp/* /var/cache/apk/*
RUN npm install --production
RUN chmod 755 /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]