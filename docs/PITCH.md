# Jaal in ninety seconds

A merchant offers two hundred rupees off your first order. One person opens
fifty accounts and takes it fifty times. Jaal finds those fifty accounts.

What makes it hard is that there is no bad transaction anywhere in it. All fifty
orders are placed once, paid for, and delivered. Look at any single payment and
you see a normal first-time customer. A model that scores payments one at a time
cannot see this, however large it is, because the thing that is wrong is not
inside any payment. It is that fifty of them belong to one person. So Jaal
scores the relationships between accounts and decides about the group.

We tested it on 4.8 million synthetic accounts across four hundred sealed
worlds, opened once, holding 38,400 accounts that really were in a ring. The
generator is a test fixture and this is defence only. Real promo abuse is
unlabelled, so there is no other way to check a detector against a known answer.

On those accounts a rules detector loses 48 million rupees. Jaal saves 2.25
million. The rules catch more rings and block about nine hundred real customers
doing it, and one wrongly blocked customer costs what seventy five farmed
coupons cost. That ratio is the whole problem, and it is why Jaal blocks rarely
and sends the uncertain cases to a person.

Here is the part worth keeping. Against the most careful operator we modelled, a
fresh device and a fresh address for every account, Jaal blocks nothing at all.
It still sends 57 percent of those accounts to a human, which is worth something
and is not detection. We know where this stops working, and it is in the results
table, not the footnotes.
