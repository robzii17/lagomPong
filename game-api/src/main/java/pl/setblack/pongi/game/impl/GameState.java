package pl.setblack.pongi.game.impl;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import javaslang.Tuple2;

import javax.annotation.concurrent.Immutable;

@Immutable
@JsonDeserialize
public class GameState {

    public final Ball ball;
    public final Tuple2<Player, Player> players;

    @JsonCreator
    public GameState(Ball ball, Tuple2<Player, Player> players) {
        this.ball = ball;
        this.players = players;
    }



}
