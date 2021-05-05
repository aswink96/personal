from django.conf import settings
from django.db import models
from django.utils import timezone


class Post(models.Model):

    """
    Post


    Attributes
         author(str)(foreign) : Defines the author
         title(str) : Defines the title of the blog
         text(str)  : Contents of the blog
         created_date(Date) : Date of the blog created
         published_date(Date) : The date blog is published
    """
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    text = models.TextField()
    created_date = models.DateTimeField(default=timezone.now)
    published_date = models.DateTimeField(blank=True, null=True)

    """
    function
      publish:
       use   : used to find out the data and time of blog publishing
       return: the date and time and save it
    
    """
    def publish(self):
        self.published_date = timezone.now()
        self.save()

    """
     str() method
       returns: title of the blog
    """

    def __str__(self):
        return self.title